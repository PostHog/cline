import { expect } from 'chai'
import * as vscode from 'vscode'
import type { UserInfo } from 'os'
import sinon from 'sinon'
import { afterEach, beforeEach, describe, it } from 'mocha'
import { ShellDetector } from '~/utils/shell'

describe('Shell Detection Tests', () => {
    let originalPlatform: string
    let originalEnv: NodeJS.ProcessEnv
    let originalGetConfig: any
    let userInfoStub: sinon.SinonStub
    let shellDetector: ShellDetector

    // Helper to mock VS Code configuration
    function mockVsCodeConfig(platformKey: string, defaultProfileName: string | null, profiles: Record<string, any>) {
        vscode.workspace.getConfiguration = () =>
            ({
                get: (key: string) => {
                    if (key === `defaultProfile.${platformKey}`) {
                        return defaultProfileName
                    }
                    if (key === `profiles.${platformKey}`) {
                        return profiles
                    }
                    return undefined
                },
            }) as any
    }

    beforeEach(() => {
        // Store original references
        originalPlatform = process.platform
        originalEnv = { ...process.env }
        originalGetConfig = vscode.workspace.getConfiguration

        shellDetector = new ShellDetector()

        // Create a stub for userInfo
        userInfoStub = sinon.stub(shellDetector as any, 'getUserInfo')
        userInfoStub.returns({ shell: null } as UserInfo<string>)

        // Clear environment variables for a clean test
        delete process.env.SHELL
        delete process.env.COMSPEC
    })

    afterEach(() => {
        // Restore everything
        Object.defineProperty(process, 'platform', { value: originalPlatform })
        process.env = originalEnv
        vscode.workspace.getConfiguration = originalGetConfig
    })

    // --------------------------------------------------------------------------
    // Windows Shell Detection
    // --------------------------------------------------------------------------
    describe('Windows Shell Detection', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', { value: 'win32' })
        })

        it('uses explicit PowerShell 7 path from VS Code config (profile path)', () => {
            mockVsCodeConfig('windows', 'PowerShell', {
                PowerShell: { path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' },
            })
            expect(shellDetector.getShell()).to.equal('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
        })

        it("uses PowerShell 7 path if source is 'PowerShell' but no explicit path", () => {
            mockVsCodeConfig('windows', 'PowerShell', {
                PowerShell: { source: 'PowerShell' },
            })
            expect(shellDetector.getShell()).to.equal('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
        })

        it("falls back to legacy PowerShell if profile includes 'powershell' but no path/source", () => {
            mockVsCodeConfig('windows', 'PowerShell', {
                PowerShell: {},
            })
            expect(shellDetector.getShell()).to.equal('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
        })

        it('handles undefined shell profile gracefully', () => {
            mockVsCodeConfig('windows', 'NonExistentProfile', {})
            expect(shellDetector.getShell()).to.equal('C:\\Windows\\System32\\cmd.exe')
        })

        it('uses WSL bash when profile indicates WSL source', () => {
            mockVsCodeConfig('windows', 'WSL', {
                WSL: { source: 'WSL' },
            })
            expect(shellDetector.getShell()).to.equal('/bin/bash')
        })

        it("uses WSL bash when profile name includes 'wsl'", () => {
            mockVsCodeConfig('windows', 'Ubuntu WSL', {
                'Ubuntu WSL': {},
            })
            expect(shellDetector.getShell()).to.equal('/bin/bash')
        })

        it('defaults to cmd.exe if no special profile is matched', () => {
            mockVsCodeConfig('windows', 'CommandPrompt', {
                CommandPrompt: {},
            })
            expect(shellDetector.getShell()).to.equal('C:\\Windows\\System32\\cmd.exe')
        })

        it('respects userInfo() if no VS Code config is available', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            userInfoStub.returns({ shell: 'C:\\Custom\\PowerShell.exe' } as UserInfo<string>)

            expect(shellDetector.getShell()).to.equal('C:\\Custom\\PowerShell.exe')
        })

        it('respects an odd COMSPEC if no userInfo shell is available', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            process.env.COMSPEC = 'D:\\CustomCmd\\cmd.exe'

            expect(shellDetector.getShell()).to.equal('D:\\CustomCmd\\cmd.exe')
        })
    })

    // --------------------------------------------------------------------------
    // macOS Shell Detection
    // --------------------------------------------------------------------------
    describe('macOS Shell Detection', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', { value: 'darwin' })
        })

        it('uses VS Code profile path if available', () => {
            mockVsCodeConfig('osx', 'MyCustomShell', {
                MyCustomShell: { path: '/usr/local/bin/fish' },
            })
            expect(shellDetector.getShell()).to.equal('/usr/local/bin/fish')
        })

        it('falls back to userInfo().shell if no VS Code config is available', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            userInfoStub.returns({ shell: '/opt/homebrew/bin/zsh' } as UserInfo<string>)

            expect(shellDetector.getShell()).to.equal('/opt/homebrew/bin/zsh')
        })

        it('falls back to SHELL env var if no userInfo shell is found', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            process.env.SHELL = '/usr/local/bin/zsh'

            expect(shellDetector.getShell()).to.equal('/usr/local/bin/zsh')
        })

        it('falls back to /bin/zsh if no config, userInfo, or env variable is set', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            // userInfo => null, SHELL => undefined
            expect(shellDetector.getShell()).to.equal('/bin/zsh')
        })
    })

    // --------------------------------------------------------------------------
    // Linux Shell Detection
    // --------------------------------------------------------------------------
    describe('Linux Shell Detection', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', { value: 'linux' })
        })

        it('uses VS Code profile path if available', () => {
            mockVsCodeConfig('linux', 'CustomProfile', {
                CustomProfile: { path: '/usr/bin/fish' },
            })
            expect(shellDetector.getShell()).to.equal('/usr/bin/fish')
        })

        it('falls back to userInfo().shell if no VS Code config is available', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            userInfoStub.returns({ shell: '/usr/bin/zsh' } as UserInfo<string>)

            expect(shellDetector.getShell()).to.equal('/usr/bin/zsh')
        })

        it('falls back to SHELL env var if no userInfo shell is found', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            process.env.SHELL = '/usr/bin/fish'

            expect(shellDetector.getShell()).to.equal('/usr/bin/fish')
        })

        it('falls back to /bin/bash if nothing is set', () => {
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            // userInfo => null, SHELL => undefined
            expect(shellDetector.getShell()).to.equal('/bin/bash')
        })
    })

    // --------------------------------------------------------------------------
    // Unknown Platform & Error Handling
    // --------------------------------------------------------------------------
    describe('Unknown Platform / Error Handling', () => {
        it('falls back to /bin/sh for unknown platforms', () => {
            Object.defineProperty(process, 'platform', { value: 'sunos' })
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any

            expect(shellDetector.getShell()).to.equal('/bin/sh')
        })

        it('handles VS Code config errors gracefully, falling back to userInfo shell if present', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' })
            vscode.workspace.getConfiguration = () => {
                throw new Error('Configuration error')
            }
            userInfoStub.returns({ shell: '/bin/bash' } as UserInfo<string>)

            expect(shellDetector.getShell()).to.equal('/bin/bash')
        })

        it('handles userInfo errors gracefully, falling back to environment variable if present', () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' })
            vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
            userInfoStub.throws(new Error('userInfo error'))
            process.env.SHELL = '/bin/zsh'

            expect(shellDetector.getShell()).to.equal('/bin/zsh')
        })

        it('falls back fully to default shell paths if everything fails', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' })
            vscode.workspace.getConfiguration = () => {
                throw new Error('Configuration error')
            }
            userInfoStub.throws(new Error('userInfo error'))
            // No SHELL in env
            delete process.env.SHELL

            expect(shellDetector.getShell()).to.equal('/bin/bash')
        })
    })
})
