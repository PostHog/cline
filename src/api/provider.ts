import { Anthropic } from '@anthropic-ai/sdk'
import { withExponentialBackoff } from './utils/fetch'
import { ApiStreamChunk, streamSse } from './utils/stream'
import {
    anthropicDefaultModelId,
    AnthropicModelId,
    anthropicModels,
    GeminiModelId,
    geminiModels,
    ModelInfo,
    OpenAIModelId,
    openaiModels,
} from '../shared/api'
import { allModels } from '../shared/api'

export class PostHogApiProvider {
    private apiBase: string
    apiHost?: string
    apiKey?: string
    model: string
    thinking?: boolean

    constructor(model: keyof typeof allModels, host?: string, apiKey?: string, thinking: boolean = false) {
        this.apiKey = apiKey
        this.model = model
        if (allModels[model]?.supportsExtendedThinking) {
            // safeguard against using extended thinking on a model that doesn't support it
            this.thinking = thinking
        }
        this.apiHost = host
        this.apiBase = `${this.apiHost}/api/llm_proxy/`
    }

    async *stream(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): AsyncGenerator<ApiStreamChunk> {
        if (!this.apiKey) {
            throw new Error('No API key provided')
        }
        const endpoint = new URL('completion', this.apiBase)

        let completion = ''

        const resp = await withExponentialBackoff<Response>(
            () =>
                fetch(endpoint, {
                    method: 'POST',
                    body: JSON.stringify({
                        model: this.model,
                        system: systemPrompt,
                        messages,
                        thinking: this.thinking,
                    }),
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'text/event-stream',
                        'x-api-key': this.apiKey!,
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                }) as any,
            5,
            0.5
        )

        for await (const chunk of streamSse(resp)) {
            let chunkContent = chunk
            completion += chunkContent
            yield chunkContent
        }

        return completion
    }

    async *streamFim(prefix: string, suffix: string, stop: string[], signal: AbortSignal): AsyncGenerator<string> {
        if (!this.apiKey) {
            throw new Error('No API key provided')
        }
        const endpoint = new URL('fim/completion', this.apiBase)

        let completion = ''

        const resp = await withExponentialBackoff<Response>(
            () =>
                fetch(endpoint, {
                    method: 'POST',
                    body: JSON.stringify({
                        model: this.model,
                        prompt: prefix,
                        suffix,
                        stop,
                    }),
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'text/event-stream',
                        'x-api-key': this.apiKey!,
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    signal,
                }) as any,
            5,
            0.5
        )

        for await (const chunk of streamSse(resp)) {
            let chunkContent = chunk.text
            completion += chunkContent
            yield chunkContent
        }

        return completion
    }

    getModel(): { id: string; info: ModelInfo } {
        const modelId = this.model
        if (modelId) {
            if (modelId in anthropicModels) {
                const id = modelId as AnthropicModelId
                return { id, info: anthropicModels[id] }
            }
            if (modelId in geminiModels) {
                const id = modelId as GeminiModelId
                return { id, info: geminiModels[id] }
            }
            if (modelId in openaiModels) {
                const id = modelId as OpenAIModelId
                return { id, info: openaiModels[id] }
            }
        }
        return {
            id: anthropicDefaultModelId,
            info: anthropicModels[anthropicDefaultModelId],
        }
    }
}
