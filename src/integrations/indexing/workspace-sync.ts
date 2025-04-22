import * as vscode from 'vscode'

import { Logger } from '~/services/logging/Logger'
import { ConfigManager } from '~/shared/conf'

import { Codebase, CodebaseSyncStatus, SyncStatus, TreeNode, UploadArtifactBody } from './types'
import { MerkleTreeWalker } from './walker'

export class WorkspaceSync {
    private context: vscode.ExtensionContext
    private configManager: ConfigManager

    private workspacePath: string
    private branchHash: string
    private codebaseId: string | null

    constructor(
        context: vscode.ExtensionContext,
        configManager: ConfigManager,
        workspacePath: string,
        branchHash: string
    ) {
        this.context = context
        this.configManager = configManager
        this.workspacePath = workspacePath
        this.branchHash = branchHash
        this.codebaseId = null
    }

    async init() {
        try {
            let codebaseId = this.context.workspaceState.get<string>(this.codebaseIdKey)
            if (!codebaseId) {
                codebaseId = await this.createCodebase()
                await this.context.workspaceState.update(this.codebaseIdKey, codebaseId)
            }
            this.codebaseId = codebaseId
        } catch (e) {
            Logger.log(`Failed to initialize the CodebaseSync: ${e}.`)
        }
    }

    async *retrieveDivergingFiles(forceIndex = false) {
        if (!this.canSync && !forceIndex) {
            return
        }

        const merkleTree = await new MerkleTreeWalker(this.workspacePath).buildTree()
        const treeNodes = Array.from(merkleTree.toTreeNodesGenerator())
        const status = await this.checkSyncedCodebase(treeNodes)

        const syncStatus: SyncStatus = {
            hash: this.branchHash,
            ts: Date.now(),
        }
        await this.context.workspaceState.update(this.lastSyncKey, syncStatus)

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

    async createCodebase(): Promise<string> {
        const url = new URL(
            `/api/projects/${this.configManager.currentState.apiConfiguration.posthogProjectId}/codebases`,
            this.configManager.currentState.apiConfiguration.posthogHost
        )
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.configManager.currentState.apiConfiguration.posthogApiKey}`,
            },
        })
        const data = (await response.json()) as Codebase
        return data.id
    }

    async checkSyncedCodebase(treeNodes: TreeNode[]) {
        const url = new URL(
            `/api/projects/${this.configManager.currentState.apiConfiguration.posthogProjectId}/codebases/${this.codebaseId}/sync`,
            this.configManager.currentState.apiConfiguration.posthogHost
        )
        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.configManager.currentState.apiConfiguration.posthogApiKey}`,
            },
            body: JSON.stringify({
                tree: treeNodes,
                branchHash: this.branchHash,
            }),
        })
        const data = (await response.json()) as CodebaseSyncStatus
        return data
    }

    async uploadArtifact(file: UploadArtifactBody) {
        const url = new URL(
            `/api/projects/${this.configManager.currentState.apiConfiguration.posthogProjectId}/codebases/${this.codebaseId}/upload_artifact`,
            this.configManager.currentState.apiConfiguration.posthogHost
        )

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.configManager.currentState.apiConfiguration.posthogApiKey}`,
            },
            body: JSON.stringify(file),
        })

        if (!response.ok || response.status !== 202) {
            throw new Error(`Failed to upload artifact: ${response.statusText}`)
        }
    }

    private get codebaseIdKey(): string {
        return `codebase_key_${this.workspacePath}`
    }

    private get lastSyncKey(): string {
        return `codebase_${this.codebaseId}_sync_status`
    }

    private get lastSyncStatus(): SyncStatus | undefined {
        return this.context.workspaceState.get<SyncStatus>(this.lastSyncKey)
    }

    /**
     * Returns true if the codebase can be synced.
     * Two conditions: timestamp has changed, or branchHash has changed.
     */
    private get canSync(): boolean {
        if (!this.codebaseId) {
            return false
        }

        const lastSyncStatus = this.lastSyncStatus
        if (!lastSyncStatus) {
            return true
        }

        const tenMinutesAgo = Date.now() - 1000 * 60 * 10 // 10m
        return lastSyncStatus.ts < tenMinutesAgo || lastSyncStatus.hash !== this.branchHash
    }
}
