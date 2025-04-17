export interface ExtensionConfig {
    projectId: number
    host: string
    apiKey: string
}

export type TreeNodeType = 'file' | 'dir'

export interface TreeNode {
    id: string
    parent_id?: string
    type: TreeNodeType
}

export interface Codebase {
    id: string
    user: number
    team: number
}

export interface SyncStatus {
    hash: string
    ts: number
}

export interface CodebaseSyncStatus {
    diverging_files: string[]
    synced: boolean
}

export interface UploadArtifactBody {
    id: string
    extension: string | null
    path: string
    content: string
}
