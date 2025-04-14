import { streamSse } from './utils/stream'
import { withExponentialBackoff } from './utils/fetch'

interface Query {
    kind: string
    query: string
    source: Query
}

const buildInsightEndpoint = (query: Query) => {
    if (query.kind === 'HogQLQuery') {
        return `/sql?open_query=${encodeURIComponent(query.query)}`
    }
    if (
        (query.kind === 'DataVisualizationNode' || query.kind === 'DataTableNode') &&
        query.source.kind === 'HogQLQuery'
    ) {
        return `/sql?open_query=${encodeURIComponent(query.source.query)}`
    }
    return `/insights/new?q=${encodeURIComponent(JSON.stringify(query))}`
}

export class MaxToolsProvider {
    private apiBase: string
    private apiHost?: string
    private apiKey?: string
    private projectId?: number

    constructor(apiHost?: string, apiKey?: string, projectId?: string) {
        this.apiKey = apiKey
        if (projectId) {
            this.projectId = parseInt(projectId)
        }
        if (!apiHost) {
            apiHost = 'https://us.posthog.com'
        }
        this.apiHost = process.env.IS_DEV ? 'http://localhost:8010' : apiHost
        this.apiBase = `${this.apiHost}/api/max_tools/`
    }

    async callTool(toolName: string, toolParams: Record<string, any>) {
        if (!this.apiKey) {
            throw new Error('No API key provided')
        }
        if (!this.projectId) {
            throw new Error('No project ID provided')
        }
        const endpoint = new URL(toolName, this.apiBase)
        const params = {
            ...toolParams,
            project_id: this.projectId,
        }
        const resp = await withExponentialBackoff<Response>(
            () =>
                fetch(endpoint, {
                    method: 'POST',
                    body: JSON.stringify(params),
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'text/event-stream',
                        'x-api-key': this.apiKey!,
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                }).then((response) => {
                    if (!response.ok) {
                        return response.json().then((error) => Promise.reject(error))
                    }
                    return response
                }),
            5,
            0.5
        )
        let result: Record<string, string> = { content: '', visualization: '' }
        for await (const chunk of streamSse(resp)) {
            if (chunk.type === 'ai/viz') {
                const vizUrl = this.apiHost + buildInsightEndpoint(chunk.answer)
                result.visualization = vizUrl
            } else if (chunk.type === 'tool') {
                result.content += chunk.content
            }
        }
        return result
    }
}
