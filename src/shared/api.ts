export type ApiProvider = 'anthropic' | 'inkeep'

export type CompletionApiProvider = 'codestral'

export interface ApiHandlerOptions {
    apiModelId?: keyof typeof allModels
    posthogApiKey?: string
    thinkingEnabled?: boolean
}

export type ApiConfiguration = ApiHandlerOptions & {
    apiProvider?: ApiProvider
    completionApiProvider?: CompletionApiProvider
    posthogHost?: string
}

// Models

export interface ModelInfo {
    maxTokens?: number
    contextWindow?: number
    supportsImages?: boolean
    supportsComputerUse?: boolean
    supportsExtendedThinking?: boolean
    description?: string
}

// Anthropic
// https://docs.anthropic.com/en/docs/about-claude/models // prices updated 2025-01-02
export type AnthropicModelId = keyof typeof anthropicModels
export const anthropicModels: Record<string, ModelInfo> = {
    'claude-3-7-sonnet-20250219': {
        maxTokens: 8192,
        contextWindow: 200_000,
        supportsImages: true,
        supportsComputerUse: true,
        supportsExtendedThinking: true,
    },
    'claude-3-5-sonnet-20241022': {
        maxTokens: 8192,
        contextWindow: 200_000,
        supportsImages: true,
        supportsComputerUse: true,
        supportsExtendedThinking: false,
    },
    'claude-3-5-haiku-20241022': {
        maxTokens: 8192,
        contextWindow: 200_000,
        supportsImages: false,
        supportsExtendedThinking: false,
    },
    'claude-3-opus-20240229': {
        maxTokens: 4096,
        contextWindow: 200_000,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'claude-3-haiku-20240307': {
        maxTokens: 4096,
        contextWindow: 200_000,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
} as const satisfies Record<string, ModelInfo> // as const assertion makes the object deeply readonly

// Inkeep
// https://docs.inkeep.com/docs/models
export const inkeepModels = {
    'inkeep-qa-expert': {},
} as const satisfies Record<string, ModelInfo> // as const assertion makes the object deeply readonly

// Codestral
// https://docs.codestral.com/docs/models
export const codestralModels = {
    'codestral-latest': {},
} as const satisfies Record<string, ModelInfo> // as const assertion makes the object deeply readonly

export const allModels: Record<string, ModelInfo> = { ...anthropicModels, ...inkeepModels, ...codestralModels }

export const anthropicDefaultModelId: keyof typeof allModels = 'claude-3-5-sonnet-20241022'
export const autocompleteDefaultModelId: keyof typeof allModels = 'codestral-latest'
export const inkeepDefaultModelId: keyof typeof allModels = 'inkeep-qa-expert'
