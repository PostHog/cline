import { expect } from 'chai'
import * as vscode from 'vscode'

import { resetExtensionState } from '../../../test/utils'
import { ENCRYPTION_KEY_NAME, PathObfuscator } from '../path-obfuscator'

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

        const obfuscated = await obfuscator.obfuscatePath(path)
        const revealed = await obfuscator.revealPath(obfuscated)
        expect(revealed).to.equal(path)
    })
})
