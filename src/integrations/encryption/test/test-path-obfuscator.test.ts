import { expect } from 'chai'
import * as vscode from 'vscode'

import { clearStorage, ConfigManager } from '~/shared/conf'

import { PathObfuscator } from '../path-obfuscator'

describe('PathObfuscator', () => {
    let extensionContext: vscode.ExtensionContext

    before(async () => {
        // Trigger extension activation and grab the context as some tests depend on it
        await vscode.extensions.getExtension('posthog.posthog-extension')?.activate()
        extensionContext = (global as any).testExtensionContext
    })

    afterEach(() => {
        clearStorage(extensionContext)
    })

    it('should create a new key if not present', async () => {
        const configManager = new ConfigManager(extensionContext)
        const obfuscator = new PathObfuscator(configManager)

        expect(await configManager.getSecretValue('encryptionKey')).to.be.undefined

        await obfuscator.obfuscatePath('/test/test.txt')
        expect(await configManager.getSecretValue('encryptionKey')).not.to.be.undefined
    })

    it('should not create a new key', async () => {
        const configManager = new ConfigManager(extensionContext)

        await new PathObfuscator(configManager).obfuscatePath('/test/test.txt')
        const key = await configManager.getSecretValue('encryptionKey')
        expect(key).not.to.be.undefined

        await new PathObfuscator(configManager).obfuscatePath('/test/test.txt')
        expect(await configManager.getSecretValue('encryptionKey')).to.equal(key)
    })

    it('should obfuscate and reveal paths', async () => {
        const path = '/Users/test/test.txt'
        const configManager = new ConfigManager(extensionContext)
        const obfuscator = new PathObfuscator(configManager)

        const obfuscated = await obfuscator.obfuscatePath(path)
        const revealed = await obfuscator.revealPath(obfuscated)
        expect(revealed).to.equal(path)
    })
})
