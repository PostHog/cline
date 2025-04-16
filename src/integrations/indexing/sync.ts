import * as vscode from 'vscode'
import { Logger } from '../../services/logging/Logger'
import { CodebaseTag } from './codebase-tag'
import { MerkleTreeWalker } from './walker'
import { TreeNode } from './types'

export interface Codebase {
    id: string
    user: number
    team: number
}

export interface ExtensionConfig {
    projectId: number
    host: string
    apiKey: string
}

export class CodebaseSyncIntegration {
    private context: vscode.ExtensionContext
    private config: ExtensionConfig

    private workspaceSyncServices: Map<string, WorkspaceSync>

    initialized: boolean = false

    constructor(context: vscode.ExtensionContext, config: ExtensionConfig) {
        this.context = context
        this.config = config
        this.workspaceSyncServices = new Map()
    }

    async init() {
        const codebaseTag = new CodebaseTag()
        const codebaseTags = await codebaseTag.getTags()

        const services = await Promise.all(
            codebaseTags.map(async (codebaseTag) => {
                const workspaceSync = new WorkspaceSync(
                    this.context,
                    this.config,
                    codebaseTag.dir,
                    codebaseTag.branchHash
                )
                await workspaceSync.init()
                return [codebaseTag.dir.toString(), workspaceSync] as [string, WorkspaceSync]
            })
        )

        this.workspaceSyncServices = new Map(services)
        this.initialized = true
    }

    async sync() {
        if (!this.initialized) {
            return
        }

        const divergingFiles = await Promise.all(
            Array.from(this.workspaceSyncServices.values()).map((workspaceSync) =>
                workspaceSync.retrieveDivergingFiles()
            )
        )

        console.log(divergingFiles)
    }
}

export interface SyncStatus {
    hash: string
    ts: number
}

export interface CodebaseSyncStatus {
    diverging_files: string[]
    synced: boolean
}

class WorkspaceSync {
    private context: vscode.ExtensionContext
    private config: ExtensionConfig

    private workspace: vscode.Uri
    private branchHash: string
    private codebaseId: string | null

    constructor(context: vscode.ExtensionContext, config: ExtensionConfig, workspace: vscode.Uri, branchHash: string) {
        this.context = context
        this.config = config
        this.workspace = workspace
        this.branchHash = branchHash
        this.codebaseId = null
    }

    async init() {
        try {
            let codebaseId = await this.context.workspaceState.get<string>('codebase_id')
            if (!codebaseId) {
                codebaseId = await this.createCodebase()
                await this.context.workspaceState.update('codebase_id', codebaseId)
            }
            this.codebaseId = codebaseId
        } catch (e) {
            Logger.log(`Failed to initialize the CodebaseSync: ${e}.`)
        }
    }

    async *retrieveDivergingFiles() {
        if (!this.canSync) {
            return
        }

        const merkleTree = await new MerkleTreeWalker(this.workspace.fsPath).buildTree()
        const treeNodes = Array.from(merkleTree.toTreeNodes())
        const status = await this.checkSyncedCodebase(treeNodes)

        if (status.synced) {
            return
        }

        const hashToNodeMap = merkleTree.toLeafNodesMap()
        for (const nodeHash of status.diverging_files) {
            const node = hashToNodeMap.get(nodeHash)
            if (node) {
                yield node
            }
        }
    }

    private async createCodebase(): Promise<string> {
        const url = new URL(`/api/v1/projects/${this.config.projectId}/codebases`, this.config.host)
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
        })
        const data = (await response.json()) as Codebase
        return data.id
    }

    private async checkSyncedCodebase(treeNodes: TreeNode[]) {
        const url = new URL(
            `/api/v1/projects/${this.config.projectId}/codebases/${this.codebaseId}/sync`,
            this.config.host
        )
        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                tree: treeNodes,
            }),
        })
        const data = (await response.json()) as CodebaseSyncStatus
        return data
    }
    private get lastSyncKey(): string {
        return `codebase_${this.codebaseId}_sync_status`
    }

    private get lastSyncStatus(): SyncStatus | undefined {
        return this.context.workspaceState.get<SyncStatus>(this.lastSyncKey)
    }

    /**
     * Returns true if the codebase cab be synced.
     * Two conditions: timestamp has changed, or branch has changed.
     */
    private get canSync(): boolean {
        if (!this.codebaseId) {
            return false
        }

        const lastSyncStatus = this.lastSyncStatus
        if (!lastSyncStatus) {
            return true
        }

        const tenMinutesAgo = Date.now() - 1000 * 60 * 10
        return lastSyncStatus.ts < tenMinutesAgo || lastSyncStatus.hash !== this.branchHash
    }
}
