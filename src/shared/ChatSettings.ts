import { allModels, ApiProvider } from './api'

export interface ChatSettings {
    mode: 'ask' | 'plan' | 'act'
    ask: {
        apiProvider?: ApiProvider
        apiModelId?: keyof typeof allModels
        thinkingEnabled?: boolean
    }
    plan: {
        apiProvider?: ApiProvider
        apiModelId?: keyof typeof allModels
        thinkingEnabled?: boolean
    }
    act: {
        apiProvider?: ApiProvider
        apiModelId?: keyof typeof allModels
        thinkingEnabled?: boolean
    }
}
