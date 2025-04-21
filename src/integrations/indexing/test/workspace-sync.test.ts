import * as vscode from 'vscode'
import { expect } from 'chai'
import { stub, SinonStub, restore } from 'sinon'
import { WorkspaceSync } from '../workspace-sync'
import { ExtensionConfig } from '../types'
import { resetExtensionState } from '../../../test/utils'

describe('WorkspaceSync', () => {
    let extensionContext: vscode.ExtensionContext
    let workspaceSync: WorkspaceSync
    let createCodebaseStub: SinonStub

    const testConfig: ExtensionConfig = {
        projectId: 123,
        host: 'https://test.host',
        apiKey: 'test-api-key',
    }

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
        workspaceSync = new WorkspaceSync(extensionContext, testConfig, testWorkspacePath, testBranch)
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
})
