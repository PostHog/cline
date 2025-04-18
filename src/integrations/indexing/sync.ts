import * as vscode from 'vscode'
import PQueue from 'p-queue'
import { WorkspaceTags } from './workspace-tags'
import { PathObfuscator } from '../encryption'
import { ExtensionConfig } from './types'
import { WorkspaceSync } from './workspace-sync'
import { Logger } from '../../services/logging/Logger'
import { walkDirCache } from './walker'

export class CodebaseIndexer {
    private initialized: boolean = false
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
    }

    async sync(forceIndex = false) {
        if (!this.initialized) {
            await this.init()
        }

        try {
            await this.traverseWorkspaces(forceIndex)
        } catch (e) {
            Logger.log(`Error syncing codebase: ${e}`)
        }
    }

    async init() {
        this.workspaceSyncServices.clear()

        try {
            const workspaceTags = new WorkspaceTags()
            const tags = await workspaceTags.getTags()

            const services = await Promise.all(
                tags.map(async (workspaceTag) => {
                    const workspaceSync = new WorkspaceSync(
                        this.context,
                        this.config,
                        workspaceTag.dir.toString(),
                        workspaceTag.branchHash
                    )
                    await workspaceSync.init()
                    return [workspaceTag.dir.toString(), workspaceSync] as [string, WorkspaceSync]
                })
            )

            this.workspaceSyncServices = new Map(services)
            this.initialized = true
        } catch (e) {
            Logger.log(`Error initializing codebase indexer: ${e}`)
            this.initialized = false
        }
    }

    invalidateCaches() {
        walkDirCache.invalidate()
    }

    private async traverseWorkspaces(forceIndex = false) {
        if (this.syncLocked) {
            return
        }

        this.syncLocked = true

        const services = Array.from(this.workspaceSyncServices.values())
        const divergingFiles = await Promise.all(
            services.map(async (workspaceSyncService) => {
                const files = []
                for await (const file of workspaceSyncService.retrieveDivergingFiles(forceIndex)) {
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
