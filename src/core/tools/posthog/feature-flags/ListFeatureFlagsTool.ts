import type { ToolUse } from '~/core/assistant-message'

import type { ListFeatureFlagsToolInput, ListFeatureFlagsToolOutput } from '../../schema'
import { BasePostHogToolConfigSchema } from '../../schema'
import { ListFeatureFlagsToolInputSchema, ListFeatureFlagsToolOutputSchema } from '../../schema'
import type { ToolOutput } from '../../types'
import { PostHogTool } from '../PostHogTool'

export class ListFeatureFlagsTool extends PostHogTool<ListFeatureFlagsToolInput, ListFeatureFlagsToolOutput> {
    autoApprove = true
    name = 'list_feature_flags'
    sayToolName = 'listFeatureFlags' as const
    description = 'List all feature flags in the project.'
    inputSchema = ListFeatureFlagsToolInputSchema
    outputSchema = ListFeatureFlagsToolOutputSchema

    static isValidConfig(config: unknown): boolean {
        const result = BasePostHogToolConfigSchema.safeParse(config)
        return result.success
    }

    async execute(input: ListFeatureFlagsToolInput): Promise<ToolOutput<ListFeatureFlagsToolOutput>> {
        try {
            const queryParams = new URLSearchParams()
            for (const [key, value] of Object.entries(input.query ?? {})) {
                if (value !== undefined) {
                    queryParams.append(key, value.toString())
                }
            }

            const queryString = queryParams.toString()

            const endpoint = `projects/${this.config.posthogProjectId}/feature_flags/${queryString ? '?' + queryString : ''}`

            const data = await this.makeRequest<unknown>(endpoint, 'GET')

            return {
                success: true,
                data: this.validateOutput(data),
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    static getToolDefinitionForPrompt(): string {
        return `Description: List all feature flags in PostHog.
Parameters:
- query: (optional) query parameters for the list feature flags request
Usage:
<list_feature_flags>
<query>
{
  "active": true or false,
  "search": "an optional search term to filter the feature flags by"
}
</query>
</list_feature_flags>`
    }

    getToolUsageDescription(block: ToolUse): string {
        const params = block.params as ListFeatureFlagsToolInput
        const filters = Object.entries(params)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join(', ')
        return `[list feature flags${filters ? ` with filters: ${filters}` : ''}]`
    }
}
