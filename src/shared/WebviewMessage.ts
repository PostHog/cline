import { PostHogUsage } from '../analysis/codeAnalyzer'
import { ApiConfiguration } from './api'
import { AutoApprovalSettings } from './AutoApprovalSettings'
import { BrowserSettings } from './BrowserSettings'
import { ChatContent } from './ChatContent'
import { ChatSettings } from './ChatSettings'
import { TelemetrySetting } from './TelemetrySetting'

export interface WebviewMessage {
    type:
        | 'webviewDidLaunch'
        | 'newTask'
        | 'askResponse'
        | 'clearTask'
        | 'selectImages'
        | 'showTaskWithId'
        | 'deleteTaskWithId'
        | 'resetState'
        | 'openImage'
        | 'openInBrowser'
        | 'openFile'
        | 'openMention'
        | 'cancelTask'
        | 'openMcpSettings'
        | 'restartMcpServer'
        | 'deleteMcpServer'
        | 'autoApprovalSettings'
        | 'browserSettings'
        | 'toggleChatMode'
        | 'checkpointDiff'
        | 'checkpointRestore'
        | 'taskCompletionViewChanges'
        | 'openExtensionSettings'
        | 'toggleToolAutoApprove'
        | 'toggleMcpServer'
        | 'getLatestState'
        | 'searchCommits'
        | 'showMcpView'
        | 'fetchLatestMcpServersFromHub'
        | 'telemetrySetting'
        | 'openSettings'
        | 'updateMcpTimeout'
        | 'fetchOpenGraphData'
        | 'checkIsImageUrl'
        | 'invoke'
        | 'updateSettings'
        | 'clearAllTaskHistory'
        | 'optionsResponse'
        | 'requestTotalTasksSize'
        | 'openFileAtUsageLocation'
        | 'loadPosthogProjects'
    // | "relaunchChromeDebugMode"
    text?: string
    disabled?: boolean
    askResponse?: PostHogAskResponse
    apiConfiguration?: ApiConfiguration
    images?: string[]
    bool?: boolean
    number?: number
    autoApprovalSettings?: AutoApprovalSettings
    browserSettings?: BrowserSettings
    chatMode?: ChatSettings['mode']
    chatSettings?: ChatSettings
    chatContent?: ChatContent
    mcpId?: string
    timeout?: number
    // For toggleToolAutoApprove
    serverName?: string
    toolName?: string
    autoApprove?: boolean

    customToken?: string
    // For openInBrowser
    url?: string
    telemetrySetting?: TelemetrySetting
    enableTabAutocomplete?: boolean
    customInstructionsSetting?: string
    usage?: PostHogUsage
}

export type PostHogAskResponse = 'yesButtonClicked' | 'noButtonClicked' | 'messageResponse'

export type PostHogCheckpointRestore = 'task' | 'workspace' | 'taskAndWorkspace'
