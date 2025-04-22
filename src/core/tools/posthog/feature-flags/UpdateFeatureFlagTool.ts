import type { ToolUse } from '~/core/assistant-message'

import type { UpdateFeatureFlagToolInput, UpdateFeatureFlagToolOutput } from '../../schema'
import {
    BasePostHogToolConfigSchema,
    UpdateFeatureFlagToolInputSchema,
    UpdateFeatureFlagToolOutputSchema,
} from '../../schema'
import type { ToolOutput } from '../../types'
import { PostHogTool } from '../PostHogTool'

export class UpdateFeatureFlagTool extends PostHogTool<UpdateFeatureFlagToolInput, UpdateFeatureFlagToolOutput> {
    autoApprove = false
    name = 'update_feature_flag'
    sayToolName = 'updateFeatureFlag' as const
    description = 'Update an existing feature flag'
    inputSchema = UpdateFeatureFlagToolInputSchema
    outputSchema = UpdateFeatureFlagToolOutputSchema

    static isValidConfig(config: unknown): boolean {
        const result = BasePostHogToolConfigSchema.safeParse(config)
        return result.success
    }

    async execute(input: UpdateFeatureFlagToolInput): Promise<ToolOutput<UpdateFeatureFlagToolOutput>> {
        try {
            // Prepare the update payload
            const updatePayload: Record<string, unknown> = {}

            if (input.body.active !== undefined) {
                updatePayload.active = input.body.active
            }

            const data = await this.makeRequest<unknown>(
                `projects/${this.config.posthogProjectId}/feature_flags/${input.id}/`,
                'PATCH',
                updatePayload
            )

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
        return `Description: Update an existing feature flag in PostHog to set it as active or inactive. You can use this to toggle test feature flags that you create.
Parameters:
- id: (required) The id of the feature flag to update.
- body: (required) A JSON object containing the updated flag, all keys are optional.
Usage:
<update_feature_flag>
<id>Feature flag id</id>
<body>
{
  "active": true or false
}
</body>
</update_feature_flag>`
    }

    getToolUsageDescription(block: ToolUse): string {
        return `[update feature flag with id ${block.params.id}]`
    }
}
