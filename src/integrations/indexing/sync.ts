import * as vscode from 'vscode'
import PQueue from 'p-queue'
import { Logger } from '../../services/logging/Logger'
import { CodebaseTag } from './codebase-tag'
import { MerkleTreeWalker } from './walker'
import { TreeNode } from './types'
import { PathObfuscator } from '../encryption'

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
    private initPromise: Promise<void> | true
    private context: vscode.ExtensionContext
    private config: ExtensionConfig
    private pathObfuscator: PathObfuscator

    private workspaceSyncServices: Map<string, WorkspaceSync>

    private syncLocked: boolean = false

    constructor(context: vscode.ExtensionContext, config: ExtensionConfig, pathObfuscator: PathObfuscator) {
        this.context = context
        this.config = config
        this.workspaceSyncServices = new Map()
        this.pathObfuscator = pathObfuscator
        this.initPromise = this.init()
    }

    private async init() {
        const codebaseTag = new CodebaseTag()
        const codebaseTags = await codebaseTag.getTags()

        const services = await Promise.all(
            codebaseTags.map(async (codebaseTag) => {
                const workspaceSync = new WorkspaceSync(
                    this.context,
                    this.config,
                    codebaseTag.dir.toString(),
                    codebaseTag.branchHash
                )
                await workspaceSync.init()
                return [codebaseTag.dir.toString(), workspaceSync] as [string, WorkspaceSync]
            })
        )

        this.workspaceSyncServices = new Map(services)
        this.initPromise = true
    }

    private async awaitInit() {
        try {
            if (this.initPromise === true) {
                return
            }
            await this.initPromise
        } catch (error) {
            Logger.log(`Error initializing codebase sync integration: ${error}`)
            throw error
        }
    }

    async sync() {
        await this.awaitInit()

        if (this.syncLocked) {
            return
        }

        this.syncLocked = true

        const services = Array.from(this.workspaceSyncServices.values())
        const divergingFiles = await Promise.all(
            services.map(async (workspaceSyncService) => {
                const files = []
                for await (const file of workspaceSyncService.retrieveDivergingFiles()) {
                    files.push(file)
                }

                return files
            })
        )

        const fileCount = divergingFiles.reduce((acc, files) => acc + files.length, 0)
        if (!fileCount) {
            this.syncLocked = false
            return
        }

        let processedCount = 0

        const fileSyncQueue = new PQueue({
            concurrency: 1,
            timeout: 30_000,
            throwOnTimeout: true,
            intervalCap: 100,
            interval: 60_000,
        })
        const retryMapping = new Map<string, number>()

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: 'Codebase Sync',
            },
            async (progress) => {
                function reportProgress() {
                    progress.report({
                        message: `Uploading file ${processedCount} of ${fileCount}...`,
                        increment: processedCount / fileCount,
                    })
                }

                reportProgress()

                for (let i = 0; i < services.length; i++) {
                    const workspaceSyncService = services[i]
                    const files = divergingFiles[i]

                    for (const file of files) {
                        fileSyncQueue
                            .add(
                                async () => {
                                    const [content, obfuscatedPath] = await Promise.all([
                                        file.read(),
                                        this.pathObfuscator.obfuscatePath(file.path),
                                    ])

                                    await workspaceSyncService.uploadArtifact({
                                        id: file.hash,
                                        extension: file.extension,
                                        path: obfuscatedPath,
                                        content: content.toString(),
                                    })

                                    processedCount += 1
                                    reportProgress()
                                },
                                { throwOnTimeout: true }
                            )
                            .catch(() => {
                                const retriesCount = retryMapping.get(file.hash)
                                if (retriesCount && retriesCount >= 3) {
                                    processedCount += 1
                                    reportProgress()
                                    return
                                }

                                if (retriesCount) {
                                    retryMapping.set(file.hash, retriesCount + 1)
                                } else {
                                    retryMapping.set(file.hash, 1)
                                }
                            })
                    }
                }

                await fileSyncQueue.onIdle()

                this.syncLocked = false
            }
        )
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

export interface UploadArtifactBody {
    id: string
    extension: string | null
    path: string
    content: string
}

class WorkspaceSync {
    private context: vscode.ExtensionContext
    private config: ExtensionConfig

    private workspacePath: string
    private branchHash: string
    private codebaseId: string | null

    constructor(context: vscode.ExtensionContext, config: ExtensionConfig, workspacePath: string, branchHash: string) {
        this.context = context
        this.config = config
        this.workspacePath = workspacePath
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

        const merkleTree = await new MerkleTreeWalker(this.workspacePath).buildTree()
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
        const url = new URL(`/api/projects/${this.config.projectId}/codebases`, this.config.host)
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
            `/api/projects/${this.config.projectId}/codebases/${this.codebaseId}/sync`,
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

    async uploadArtifact(file: UploadArtifactBody) {
        const url = new URL(
            `/api/projects/${this.config.projectId}/codebases/${this.codebaseId}/upload_artifact`,
            this.config.host
        )

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify(file),
        })

        if (!response.ok || response.status !== 202) {
            throw new Error(`Failed to upload artifact: ${response.statusText}`)
        }
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
