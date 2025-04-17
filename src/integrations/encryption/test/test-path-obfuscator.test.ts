import * as vscode from 'vscode'
import { expect } from 'chai'
import { ENCRYPTION_KEY_NAME, PathObfuscator } from '../path-obfuscator'
import { resetExtensionState } from '../../../test/utils'

describe('PathObfuscator', () => {
    let extensionContext: vscode.ExtensionContext

    before(async () => {
        // Trigger extension activation and grab the context as some tests depend on it
        await vscode.extensions.getExtension('posthog.posthog-extension')?.activate()
        extensionContext = (global as any).testExtensionContext
    })

    afterEach(() => {
        resetExtensionState(extensionContext, [ENCRYPTION_KEY_NAME])
    })

    it('should obfuscate and reveal paths', async () => {
        const path = '/Users/test/test.txt'
        const obfuscator = new PathObfuscator(extensionContext)
        await obfuscator.init()

        const obfuscated = obfuscator.obfuscatePath(path)
        const revealed = obfuscator.revealPath(obfuscated)
        expect(revealed).to.equal(path)
    })
})
