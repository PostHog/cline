import { CreateFeatureFlagTool } from './posthog/feature-flags/CreateFeatureFlagTool'
import { ListFeatureFlagsTool } from './posthog/feature-flags/ListFeatureFlagsTool'
import { UpdateFeatureFlagTool } from './posthog/feature-flags/UpdateFeatureFlagTool'
import type { PostHogToolConfig, ToolManagerConfig, ToolMap, ToolMapping, ToolName } from './types'

export class ToolManager {
    private tools: ToolMap
    private config: ToolManagerConfig

    constructor(config: ToolManagerConfig) {
        this.config = config

        //@ts-ignore we interface this via getTool, so we can ignore the type error
        this.tools = new Map([
            [
                'create_feature_flag',
                CreateFeatureFlagTool.isValidConfig(this.config)
                    ? new CreateFeatureFlagTool(this.config as PostHogToolConfig)
                    : undefined,
            ],
            [
                'update_feature_flag',
                UpdateFeatureFlagTool.isValidConfig(this.config)
                    ? new UpdateFeatureFlagTool(this.config as PostHogToolConfig)
                    : undefined,
            ],
            [
                'list_feature_flags',
                ListFeatureFlagsTool.isValidConfig(this.config)
                    ? new ListFeatureFlagsTool(this.config as PostHogToolConfig)
                    : undefined,
            ],
        ] as const)
    }

    getTool(name: ToolName): ToolMapping[ToolName] | undefined {
        return this.tools.get(name) as ToolMapping[ToolName] | undefined
    }
}
