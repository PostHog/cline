export type ApiProvider = 'anthropic' | 'openai' | 'gemini' | 'inkeep'

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
    posthogProjectId?: string
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

// OpenAI
// https://platform.openai.com/docs/models
export type OpenAIModelId = keyof typeof openaiModels
export const openaiModels = {
    'gpt-4.1': {
        maxTokens: 32_768,
        contextWindow: 1_047_576,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'gpt-4.1-mini': {
        maxTokens: 32_768,
        contextWindow: 1_047_576,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'gpt-4.1-nano': {
        maxTokens: 32_768,
        contextWindow: 1_047_576,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    o3: {
        maxTokens: 100_000,
        contextWindow: 200_000,
        supportsImages: true,
        supportsExtendedThinking: true,
    },
    'o4-mini': {
        maxTokens: 100_000,
        contextWindow: 200_000,
        supportsImages: true,
        supportsExtendedThinking: true,
    },
    'o3-mini': {
        maxTokens: 100_000,
        contextWindow: 200_000,
        supportsImages: false,
        supportsExtendedThinking: true,
    },
    o1: {
        maxTokens: 100_000,
        contextWindow: 200_000,
        supportsImages: true,
        supportsExtendedThinking: true,
    },
    'o1-mini': {
        maxTokens: 65_536,
        contextWindow: 128_000,
        supportsImages: true,
        supportsExtendedThinking: true,
    },
    'gpt-4o': {
        maxTokens: 4_096,
        contextWindow: 128_000,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'gpt-4o-mini': {
        maxTokens: 16_384,
        contextWindow: 128_000,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'chatgpt-4o-latest': {
        maxTokens: 16_384,
        contextWindow: 128_000,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
} as const satisfies Record<string, ModelInfo> // as const assertion makes the object deeply readonly

// Gemini
// https://ai.google.dev/gemini-api/docs/models
export type GeminiModelId = keyof typeof geminiModels
export const geminiModels = {
    'gemini-2.0-flash-001': {
        maxTokens: 8192,
        contextWindow: 1_048_576,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'gemini-2.0-flash-lite-001': {
        maxTokens: 8192,
        contextWindow: 1_048_576,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'gemini-1.5-flash': {
        maxTokens: 8192,
        contextWindow: 1_048_576,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
    'gemini-1.5-flash-8b': {
        maxTokens: 8192,
        contextWindow: 1_048_576,
        supportsImages: true,
        supportsExtendedThinking: false,
    },
} as const satisfies Record<string, ModelInfo> // as const assertion makes the object deeply readonly

export const allModels: Record<string, ModelInfo> = {
    ...anthropicModels,
    ...inkeepModels,
    ...codestralModels,
    ...openaiModels,
}

export const anthropicDefaultModelId: keyof typeof allModels = 'claude-3-5-sonnet-20241022'
export const openaiDefaultModelId: keyof typeof allModels = 'gpt-4.1'
export const geminiDefaultModelId: keyof typeof allModels = 'gemini-2.0-flash-001'
export const codestralDefaultModelId: keyof typeof allModels = 'codestral-latest'
export const inkeepDefaultModelId: keyof typeof allModels = 'inkeep-qa-expert'

export const getDefaultModelId = (provider: string): string => {
    switch (provider) {
        case 'anthropic':
            return anthropicDefaultModelId
        case 'openai':
            return openaiDefaultModelId
        case 'gemini':
            return geminiDefaultModelId
        case 'inkeep':
            return inkeepDefaultModelId
        case 'codestral':
            return codestralDefaultModelId
        default:
            return ''
    }
}
