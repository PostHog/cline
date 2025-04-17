import type { CreateFeatureFlagTool } from './posthog/feature-flags/CreateFeatureFlagTool'
import type { UpdateFeatureFlagTool } from './posthog/feature-flags/UpdateFeatureFlagTool'
import type { ListFeatureFlagsTool } from './posthog/feature-flags/ListFeatureFlagsTool'
import type { BaseTool } from './base/BaseTool'

export type ToolInput<T> = T

export interface ToolOutput<T> {
    success: boolean
    data?: T
    error?: string
}

export type ToolManagerConfig = Partial<PostHogToolConfig>

export type ToolMapping = {
    create_feature_flag: CreateFeatureFlagTool
    update_feature_flag: UpdateFeatureFlagTool
    list_feature_flags: ListFeatureFlagsTool
}

export type ToolName = keyof ToolMapping

export type ToolMap = ReadonlyMap<ToolName, BaseTool<any, any> | undefined>

export interface PostHogToolConfig {
    posthogApiKey: string
    posthogHost: string
    posthogProjectId: string
}

export type Tool = CreateFeatureFlagTool | UpdateFeatureFlagTool | ListFeatureFlagsTool
