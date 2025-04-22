import { expect } from 'chai'
import { restore, SinonStub, stub } from 'sinon'
import * as vscode from 'vscode'

import { ConfigManager } from '~/shared/conf'

import { resetExtensionState } from '../../../test/utils'
import { CodebaseSyncStatus, SyncStatus, TreeNode } from '../types'
import { MerkleTreeWalker } from '../walker'
import { WorkspaceSync } from '../workspace-sync'

describe('WorkspaceSync', () => {
    let extensionContext: vscode.ExtensionContext
    let workspaceSync: WorkspaceSync
    let createCodebaseStub: SinonStub

    const testWorkspacePath = '/test/workspace/path'
    const testBranch = 'main'
    const testCodebaseId = 'test-codebase-id'
    const codebaseIdKey = `codebase_key_${testWorkspacePath}`

    before(async () => {
        // Trigger extension activation and grab the context as some tests depend on it
        await vscode.extensions.getExtension('posthog.posthog-extension')?.activate()
        extensionContext = (global as any).testExtensionContext
    })

    beforeEach(() => {
        const configManager = stub(ConfigManager.prototype)
        workspaceSync = new WorkspaceSync(extensionContext, configManager, testWorkspacePath, testBranch)
        createCodebaseStub = stub(workspaceSync, 'createCodebase').resolves(testCodebaseId)
    })

    afterEach(() => {
        resetExtensionState(extensionContext, [])
        restore()
    })

    describe('init', () => {
        it('should call createCodebase if there is no saved codebase', async () => {
            await workspaceSync.init()

            expect(createCodebaseStub.calledOnce).to.be.true
            expect(await extensionContext.workspaceState.get(codebaseIdKey)).to.equal(testCodebaseId)
        })

        it('should not call createCodebase if there is a saved codebase', async () => {
            // Pre-set the codebase ID in the workspace state
            await extensionContext.workspaceState.update(codebaseIdKey, testCodebaseId)

            await workspaceSync.init()

            expect(createCodebaseStub.called).to.be.false
            expect(await extensionContext.workspaceState.get(codebaseIdKey)).to.equal(testCodebaseId)
        })
    })

    describe('canSync', () => {
        beforeEach(async () => {
            // Initialize the codebaseId property required for canSync to work
            await extensionContext.workspaceState.update(codebaseIdKey, testCodebaseId)
            await workspaceSync.init()
        })

        it('should return true when hash does not match but time is less than 10 minutes', async () => {
            const currentTime = Date.now()
            const diffBranch = 'different-branch'
            const lastSyncStatus: SyncStatus = {
                hash: diffBranch,
                ts: currentTime - 1000 * 60 * 5, // 5 minutes ago
            }

            const lastSyncKey = `codebase_${testCodebaseId}_sync_status`
            await extensionContext.workspaceState.update(lastSyncKey, lastSyncStatus)

            // Access private method for testing via any
            const canSync = (workspaceSync as any).canSync
            expect(canSync).to.be.true
        })

        it('should return true when hash does not match and time is more than 10 minutes', async () => {
            const currentTime = Date.now()
            const diffBranch = 'different-branch'
            const lastSyncStatus: SyncStatus = {
                hash: diffBranch,
                ts: currentTime - 1000 * 60 * 15, // 15 minutes ago
            }

            const lastSyncKey = `codebase_${testCodebaseId}_sync_status`
            await extensionContext.workspaceState.update(lastSyncKey, lastSyncStatus)

            // Access private method for testing via any
            const canSync = (workspaceSync as any).canSync
            expect(canSync).to.be.true
        })

        it('should return false when hash matches and time is less than 10 minutes', async () => {
            const currentTime = Date.now()
            const lastSyncStatus: SyncStatus = {
                hash: testBranch, // Same branch as current
                ts: currentTime - 1000 * 60 * 5, // 5 minutes ago
            }

            const lastSyncKey = `codebase_${testCodebaseId}_sync_status`
            await extensionContext.workspaceState.update(lastSyncKey, lastSyncStatus)

            // Access private method for testing via any
            const canSync = (workspaceSync as any).canSync
            expect(canSync).to.be.false
        })

        it('should return true when time is more than 10 minutes ago, regardless of hash', async () => {
            const currentTime = Date.now()
            const lastSyncStatus: SyncStatus = {
                hash: testBranch, // Same branch as current
                ts: currentTime - 1000 * 60 * 15, // 15 minutes ago
            }

            const lastSyncKey = `codebase_${testCodebaseId}_sync_status`
            await extensionContext.workspaceState.update(lastSyncKey, lastSyncStatus)

            // Access private method for testing via any
            const canSync = (workspaceSync as any).canSync
            expect(canSync).to.be.true
        })
    })

    describe('retrieveDivergingFiles', () => {
        let merkleTreeStub: SinonStub
        let checkSyncedCodebaseStub: SinonStub
        let canSyncStub: SinonStub

        const testTreeNodes: TreeNode[] = [
            { id: 'hash1', type: 'file' },
            { id: 'hash2', type: 'file' },
            { id: 'hash3', type: 'dir' },
        ]

        beforeEach(async () => {
            // Initialize the codebaseId property required for checkSyncedCodebase to work
            await extensionContext.workspaceState.update(codebaseIdKey, testCodebaseId)
            await workspaceSync.init()

            // Create a mock MerkleTreeWalker that returns predetermined test nodes
            const mockTree = {
                toTreeNodesGenerator: () => testTreeNodes,
                toLeafNodesMap: () =>
                    new Map([
                        ['hash1', { hash: 'hash1', path: 'file1.txt', content: 'content1' }],
                        ['hash2', { hash: 'hash2', path: 'file2.txt', content: 'content2' }],
                    ]),
            }

            merkleTreeStub = stub(MerkleTreeWalker.prototype, 'buildTree').resolves(mockTree as any)
            checkSyncedCodebaseStub = stub(workspaceSync, 'checkSyncedCodebase')
            canSyncStub = stub(workspaceSync as any, 'canSync')
        })

        it('should yield nothing when all files are synced and forceIndex is false', async () => {
            // Simulate all files being synced
            checkSyncedCodebaseStub.resolves({
                synced: true,
                diverging_files: [],
            } as CodebaseSyncStatus)

            canSyncStub.get(() => true)

            // Use an array to collect the generator results
            const results = []
            for await (const file of workspaceSync.retrieveDivergingFiles(false)) {
                results.push(file)
            }

            expect(results.length).to.equal(0)
            expect(merkleTreeStub.calledOnce).to.be.true
            expect(checkSyncedCodebaseStub.calledOnce).to.be.true
            expect(checkSyncedCodebaseStub.firstCall.args[0]).to.deep.equal(testTreeNodes)
        })

        it('should yield diverging files when not all files are synced and forceIndex is false', async () => {
            // Simulate unsynced files
            checkSyncedCodebaseStub.resolves({
                synced: false,
                diverging_files: ['hash1', 'hash2'],
            } as CodebaseSyncStatus)

            canSyncStub.get(() => true)

            // Use an array to collect the generator results
            const results = []
            for await (const file of workspaceSync.retrieveDivergingFiles(false)) {
                results.push(file)
            }

            expect(results.length).to.equal(2)
            expect(results[0]).to.deep.include({ hash: 'hash1', path: 'file1.txt' })
            expect(results[1]).to.deep.include({ hash: 'hash2', path: 'file2.txt' })
            expect(merkleTreeStub.calledOnce).to.be.true
            expect(checkSyncedCodebaseStub.calledOnce).to.be.true
        })

        it('should proceed even when canSync is false if forceIndex is true', async () => {
            // Simulate unsynced files
            checkSyncedCodebaseStub.resolves({
                synced: false,
                diverging_files: ['hash1'],
            } as CodebaseSyncStatus)

            // Set canSync to return false
            canSyncStub.get(() => false)

            // Use an array to collect the generator results with forceIndex=true
            const results = []
            for await (const file of workspaceSync.retrieveDivergingFiles(true)) {
                results.push(file)
            }

            expect(results.length).to.equal(1)
            expect(results[0]).to.deep.include({ hash: 'hash1', path: 'file1.txt' })
            expect(merkleTreeStub.calledOnce).to.be.true
            expect(checkSyncedCodebaseStub.calledOnce).to.be.true
        })

        it('should not proceed when canSync is false and forceIndex is false', async () => {
            // Set canSync to return false
            canSyncStub.get(() => false)

            // Use an array to collect the generator results with forceIndex=false
            const results = []
            for await (const file of workspaceSync.retrieveDivergingFiles(false)) {
                results.push(file)
            }

            expect(results.length).to.equal(0)
            expect(merkleTreeStub.called).to.be.false
            expect(checkSyncedCodebaseStub.called).to.be.false
        })

        it('should update sync status in storage after checking codebase', async () => {
            // Simulate unsynced files
            checkSyncedCodebaseStub.resolves({
                synced: false,
                diverging_files: ['hash1'],
            } as CodebaseSyncStatus)

            canSyncStub.get(() => true)

            // Mock Date.now() to return a consistent timestamp for testing
            const testTimestamp = 1234567890000
            const dateNowStub = stub(Date, 'now').returns(testTimestamp)

            // Trigger the retrieveDivergingFiles method
            const results = []
            for await (const file of workspaceSync.retrieveDivergingFiles(false)) {
                results.push(file)
            }

            // Get the lastSyncKey using reflection
            const lastSyncKey = `codebase_${testCodebaseId}_sync_status`

            // Get the sync status from the storage
            const syncStatus = await extensionContext.workspaceState.get<SyncStatus>(lastSyncKey)

            // Verify the sync status was updated with correct values
            expect(syncStatus).to.not.be.undefined
            expect(syncStatus?.hash).to.equal(testBranch)
            expect(syncStatus?.ts).to.equal(testTimestamp)

            // Restore Date.now
            dateNowStub.restore()
        })
    })
})
