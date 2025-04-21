import { ExtensionContext } from 'vscode'
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from './AutoApprovalSettings'
import { allModels, anthropicDefaultModelId, ApiConfiguration } from './api'
import { BrowserSettings, DEFAULT_BROWSER_SETTINGS } from './BrowserSettings'
import { ApiProvider, CompletionApiProvider } from './api'
import { HistoryItem } from './HistoryItem'
import { ChatSettings } from './ChatSettings'
import { TelemetrySetting } from './TelemetrySetting'
import { UserInfo } from './UserInfo'

type SecretKey = 'posthogApiKey'

type GlobalStateKey =
    | 'apiProvider'
    | 'completionApiProvider'
    | 'apiModelId'
    | 'customInstructions'
    | 'taskHistory'
    | 'autoApprovalSettings'
    | 'browserSettings'
    | 'chatSettings'
    | 'userInfo'
    | 'telemetrySetting'
    | 'thinkingEnabled'
    | 'enableTabAutocomplete'
    | 'posthogHost'
    | 'posthogProjectId'

export interface ExtensionStorageState {
    apiConfiguration: ApiConfiguration
    customInstructions?: string
    taskHistory?: HistoryItem[]
    autoApprovalSettings: AutoApprovalSettings
    browserSettings: BrowserSettings
    chatSettings: ChatSettings
    userInfo?: UserInfo
    telemetrySetting: TelemetrySetting
    enableTabAutocomplete?: boolean
}

export class ConfigManager {
    private _cachedState: ExtensionStorageState | undefined

    constructor(private readonly context: ExtensionContext) {}

    async init(): Promise<ExtensionStorageState> {
        if (this._cachedState) {
            throw new Error('Already initialized.')
        }
        this._cachedState = await this.loadState()
        return this._cachedState
    }

    get currentState() {
        if (!this._cachedState) {
            throw new Error('ExtensionStorage not initialized')
        }
        return this._cachedState
    }

    getGlobalValue<T>(key: GlobalStateKey): T | undefined {
        return this.context.globalState.get<T>(key)
    }

    async setGlobalValue(key: GlobalStateKey, value: any) {
        await this.context.globalState.update(key, value)
    }

    async getSecretValue(key: SecretKey): Promise<string | undefined> {
        return await this.context.secrets.get(key)
    }

    async setSecretValue(key: SecretKey, value: string) {
        await this.context.secrets.store(key, value)
    }

    async deleteSecretValue(key: SecretKey) {
        await this.context.secrets.delete(key)
    }

    async loadState(): Promise<ExtensionStorageState> {
        const [
            storedApiProvider,
            storedCompletionApiProvider,
            storedApiModelId,
            posthogApiKey,
            customInstructions,
            taskHistory,
            autoApprovalSettings,
            browserSettings,
            storedChatSettings,
            userInfo,
            telemetrySetting,
            thinkingEnabled,
            enableTabAutocomplete,
            storedPostHogHost,
            posthogProjectId,
        ] = await Promise.all([
            this.getGlobalValue<ApiProvider>('apiProvider'),
            this.getGlobalValue<CompletionApiProvider>('completionApiProvider'),
            this.getGlobalValue<string>('apiModelId'),
            this.getSecretValue('posthogApiKey'),
            this.getGlobalValue<string>('customInstructions'),
            this.getGlobalValue<HistoryItem[]>('taskHistory'),
            this.getGlobalValue<AutoApprovalSettings>('autoApprovalSettings'),
            this.getGlobalValue<BrowserSettings>('browserSettings'),
            this.getGlobalValue<ChatSettings>('chatSettings'),
            this.getGlobalValue<UserInfo>('userInfo'),
            this.getGlobalValue<TelemetrySetting>('telemetrySetting'),
            this.getGlobalValue<boolean>('thinkingEnabled'),
            this.getGlobalValue<boolean>('enableTabAutocomplete'),
            this.getGlobalValue<string>('posthogHost'),
            this.getGlobalValue<string>('posthogProjectId'),
        ])

        let apiProvider: ApiProvider
        if (storedApiProvider) {
            apiProvider = storedApiProvider
        } else {
            // Either new user or legacy user that doesn't have the apiProvider stored in state
            apiProvider = 'anthropic'
        }
        let apiModelId: keyof typeof allModels
        if (storedApiModelId) {
            apiModelId = storedApiModelId as keyof typeof allModels
        } else {
            apiModelId = anthropicDefaultModelId
        }
        let completionApiProvider: CompletionApiProvider
        if (storedCompletionApiProvider) {
            completionApiProvider = storedCompletionApiProvider
        } else {
            completionApiProvider = 'codestral'
        }
        let posthogHost: string
        if (storedPostHogHost) {
            posthogHost = storedPostHogHost
        } else {
            posthogHost = 'https://us.posthog.com'
        }
        let chatSettings: ChatSettings
        if (storedChatSettings) {
            chatSettings = storedChatSettings
            // ensure all modes are present
            for (const mode of ['ask', 'plan', 'act'] as const) {
                if (chatSettings[mode] === undefined) {
                    chatSettings[mode] = {
                        apiProvider,
                        apiModelId,
                        thinkingEnabled,
                    }
                }
            }
        } else {
            chatSettings = {
                mode: 'ask',
                ask: {
                    apiProvider,
                    apiModelId,
                    thinkingEnabled,
                },
                plan: {
                    apiProvider,
                    apiModelId,
                    thinkingEnabled,
                },
                act: {
                    apiProvider,
                    apiModelId,
                    thinkingEnabled,
                },
            }
        }

        const state: ExtensionStorageState = {
            apiConfiguration: {
                apiProvider,
                completionApiProvider,
                apiModelId,
                posthogHost,
                posthogApiKey,
                posthogProjectId,
                thinkingEnabled,
            },
            customInstructions,
            taskHistory,
            autoApprovalSettings: autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS, // default value can be 0 or empty string
            browserSettings: browserSettings || DEFAULT_BROWSER_SETTINGS,
            chatSettings,
            userInfo,
            telemetrySetting: telemetrySetting || 'unset',
            enableTabAutocomplete,
        }

        this._cachedState = state
        return state
    }

    async updateApiConfiguration(apiConfiguration: ApiConfiguration) {
        const updatePromises = Object.entries(apiConfiguration)
            .map(([key, value]) => {
                const typedKey = key as keyof ApiConfiguration

                if (value === undefined) {
                    return null
                }

                if (typedKey === 'posthogApiKey') {
                    return this.setSecretValue(typedKey, value)
                }

                return this.setGlobalValue(typedKey, value)
            })
            .filter(Boolean)

        await Promise.all(updatePromises)
    }

    async clearAllData() {
        const globalStatePromises = this.context.globalState
            .keys()
            .map((key) => this.context.globalState.update(key, undefined))

        const secretKeys: SecretKey[] = ['posthogApiKey']
        const secretPromises = secretKeys.map((key) => this.deleteSecretValue(key))

        await Promise.all([...globalStatePromises, ...secretPromises])
    }
}
