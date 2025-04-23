import { expect } from 'chai'
import { restore, SinonFakeTimers, SinonStub, stub, useFakeTimers } from 'sinon'
import * as vscode from 'vscode'

import { API as GitExtensionAPI } from '~/api/extensions/git'
import { clearStorage, ConfigManager } from '~/shared/conf'

import { PathObfuscator } from '../../encryption'
import { MerkleTreeNode } from '../merkle-tree-node'
import { CodebaseIndexer } from '../sync'
import { WorkspaceSync } from '../workspace-sync'

describe('CodebaseIndexer Integration', () => {
    let extensionContext: vscode.ExtensionContext
    let codebaseIndexer: CodebaseIndexer
    let pathObfuscator: PathObfuscator
    let clock: SinonFakeTimers

    // Stubs
    let getGitExtensionStub: SinonStub
    let workspaceSyncStub: SinonStub
    let retrieveDivergingFilesStub: SinonStub
    let obfuscatePathStub: SinonStub
    let uploadArtifactStub: SinonStub
    let onDidSaveStub: SinonStub
    let onDidCreateFilesStub: SinonStub
    let onDidDeleteFilesStub: SinonStub

    const mockFile1: Partial<MerkleTreeNode> = {
        hash: 'hash1',
        path: '/test/workspace/path/file1.txt',
        extension: '.txt',
        read: async () => Buffer.from('file1 content'),
    }

    const mockFile2: Partial<MerkleTreeNode> = {
        hash: 'hash2',
        path: '/test/workspace/path/file2.js',
        extension: '.js',
        read: async () => Buffer.from('file2 content'),
    }

    before(async () => {
        // Trigger extension activation and grab the context as some tests depend on it
        await vscode.extensions.getExtension('posthog.posthog-extension')?.activate()
        extensionContext = (global as any).testExtensionContext
    })

    beforeEach(async () => {
        // Setup fake timer with shouldClearNativeTimers option to handle native timers
        clock = useFakeTimers({ shouldClearNativeTimers: true })

        // Create PathObfuscator instance
        const configManager = new ConfigManager(extensionContext)
        pathObfuscator = new PathObfuscator(configManager)

        // Stub vscode.workspace.workspaceFolders
        const mockWorkspaceFolder = {
            uri: { toString: () => '/test/workspace/path', fsPath: '/test/workspace/path' },
            name: 'test-workspace',
            index: 0,
        }
        stub(vscode.workspace, 'workspaceFolders').value([mockWorkspaceFolder])

        // Stub Git extension API
        const mockGitRepo = {
            rootUri: { toString: () => '/test/workspace/path' },
            state: {
                HEAD: { commit: 'main-commit-hash' },
                onDidChange: (callback: any) => {
                    return { dispose: () => {} } // Mock disposable
                },
            },
        }

        const mockGitApi = {
            repositories: [mockGitRepo],
        } as unknown as GitExtensionAPI

        // Stub PathObfuscator
        obfuscatePathStub = stub(pathObfuscator, 'obfuscatePath').resolves('obfuscated-path')

        // Stub WorkspaceSync
        const createWorkspaceSyncGenerator = async function* (forceIndex: boolean) {
            if (forceIndex || true) {
                // Simulating that files always need indexing for test
                yield mockFile1 as MerkleTreeNode
                yield mockFile2 as MerkleTreeNode
            }
        }

        workspaceSyncStub = stub(WorkspaceSync.prototype, 'init').resolves()
        retrieveDivergingFilesStub = stub(WorkspaceSync.prototype, 'retrieveDivergingFiles').callsFake(() =>
            createWorkspaceSyncGenerator(false)
        )
        uploadArtifactStub = stub(WorkspaceSync.prototype, 'uploadArtifact').resolves()

        // Stub vscode events
        onDidSaveStub = stub(vscode.workspace, 'onDidSaveTextDocument').returns({
            dispose: () => {},
        } as any)

        onDidCreateFilesStub = stub(vscode.workspace, 'onDidCreateFiles').returns({
            dispose: () => {},
        } as any)

        onDidDeleteFilesStub = stub(vscode.workspace, 'onDidDeleteFiles').returns({
            dispose: () => {},
        } as any)

        // Setup progress window to execute the task immediately
        stub(vscode.window, 'withProgress').callsFake(async (options, task) => {
            // Mock the progress reporting
            const progress = {
                report: () => {},
            }

            // Execute the task directly with undefined as cancellation token which is allowed
            return await task(progress, undefined as any)
        })

        const configManagerStub = stub(ConfigManager.prototype)

        // Create the CodebaseIndexer instance
        codebaseIndexer = new CodebaseIndexer(extensionContext, configManagerStub, pathObfuscator)

        // Mock the getGitExtension method
        getGitExtensionStub = stub(codebaseIndexer as any, 'getGitExtension').resolves(mockGitApi)
    })

    afterEach(() => {
        clearStorage(extensionContext, [])
        restore()
        clock.restore()
    })

    describe('init and sync', () => {
        it('should initialize and sync codebase', async () => {
            // Initialize the indexer with a modified sync method to ensure obfuscatePath is called
            await codebaseIndexer.init()

            // Verify getGitExtension was called
            expect(getGitExtensionStub.called).to.be.true
            expect(workspaceSyncStub.called).to.be.true

            // Skip checking obfuscatePathStub here as it might not be called during initialization
            // Instead, directly test the traverseWorkspaces method which should call obfuscatePath

            // Directly invoke the traverseWorkspaces method with forceIndex=true
            const traverseWorkspacesMethod = (codebaseIndexer as any).traverseWorkspaces.bind(codebaseIndexer)
            await traverseWorkspacesMethod(true)

            // Wait for any async operations to complete
            await clock.runAllAsync()

            // Verify uploadArtifact was called, which would indicate files were processed
            expect(uploadArtifactStub.called).to.be.true

            // Now verify obfuscatePath was called during file processing
            expect(obfuscatePathStub.called).to.be.true
        })

        it('should handle file save events', async () => {
            // Spy on the sync method so we can see if it's called
            const syncStub = stub(codebaseIndexer as any, 'sync')

            await codebaseIndexer.init()

            // Reset history to clear initialization calls
            retrieveDivergingFilesStub.resetHistory()

            // Get the save callback that was registered during init
            const saveCallback = onDidSaveStub.getCall(0).args[0]

            // Manually call the callback with a mock document
            saveCallback({ fileName: 'test.txt' })

            // Verify sync was called
            expect(syncStub.called).to.be.true

            // Now let's verify the full flow by calling sync directly ourselves
            syncStub.restore()

            // Reset the stubs to clearly see new calls
            retrieveDivergingFilesStub.resetHistory()

            // Call sync directly
            await (codebaseIndexer as any).sync()

            // Let debounce/async operations complete
            await clock.runAllAsync()

            // Verify we attempted to find diverging files
            expect(retrieveDivergingFilesStub.called).to.be.true
        })

        it('should handle file creation and deletion events', async () => {
            // Spy on the invalidateCaches and sync methods
            const invalidateCachesStub = stub(codebaseIndexer as any, 'invalidateCaches')
            const syncStub = stub(codebaseIndexer as any, 'sync')

            await codebaseIndexer.init()

            // Get the creation callback that was registered during init
            const createCallback = onDidCreateFilesStub.getCall(0).args[0]

            // Manually call the callback
            createCallback({ files: [{ path: 'test.txt' }] })

            // Verify invalidateCaches and sync were called
            expect(invalidateCachesStub.called).to.be.true
            expect(syncStub.called).to.be.true

            // Reset call history
            invalidateCachesStub.resetHistory()
            syncStub.resetHistory()

            // Get the deletion callback that was registered during init
            const deleteCallback = onDidDeleteFilesStub.getCall(0).args[0]

            // Manually call the callback
            deleteCallback({ files: [{ path: 'test.txt' }] })

            // Verify invalidateCaches and sync were called again
            expect(invalidateCachesStub.called).to.be.true
            expect(syncStub.called).to.be.true

            // Now let's verify the full flow by calling sync directly ourselves
            invalidateCachesStub.restore()
            syncStub.restore()

            // Reset the stubs to clearly see new calls
            retrieveDivergingFilesStub.resetHistory()

            // Call sync directly (which should now run the real sync code)
            await (codebaseIndexer as any).sync()

            // Let debounce/async operations complete
            await clock.runAllAsync()

            // Verify we attempted to find diverging files
            expect(retrieveDivergingFilesStub.called).to.be.true
        })

        it('should handle git branch changes', async () => {
            // Setup git branch change simulation
            let branchChangeCallback: any
            const mockGitRepo = {
                rootUri: { toString: () => '/test/workspace/path' },
                state: {
                    HEAD: { commit: 'main-commit-hash' },
                    onDidChange: (callback: any) => {
                        branchChangeCallback = callback
                        return { dispose: () => {} }
                    },
                },
            }

            const mockGitApi = {
                repositories: [mockGitRepo],
            } as unknown as GitExtensionAPI

            // Update the getGitExtension stub for this test
            getGitExtensionStub.resolves(mockGitApi)

            // Create and initialize a new indexer with our updated mock
            await codebaseIndexer.init()

            // Reset the history on the stubs
            workspaceSyncStub.resetHistory()

            // Simulate a git branch change by updating HEAD and triggering the callback
            mockGitRepo.state.HEAD.commit = 'new-branch-commit-hash'
            branchChangeCallback()

            // Let debounce/async operations complete
            await clock.runAllAsync()

            // Verify we re-initialized workspace sync services
            expect(workspaceSyncStub.called).to.be.true
        })
    })

    describe('error handling', () => {
        it('should handle errors during sync gracefully', async () => {
            // Reset and modify the existing retrieveDivergingFiles stub to throw an error
            retrieveDivergingFilesStub.resetBehavior()
            retrieveDivergingFilesStub.throws(new Error('Test error'))

            await codebaseIndexer.init()

            // Manually trigger sync to see how errors are handled
            const syncMethod = (codebaseIndexer as any).sync.bind(codebaseIndexer)
            await syncMethod(true)

            // If we get here without exception, the error was handled properly
            expect(retrieveDivergingFilesStub.called).to.be.true
        })
    })
})
