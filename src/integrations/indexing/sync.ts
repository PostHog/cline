import * as vscode from 'vscode'
import PQueue from 'p-queue'
import { Logger } from '../../services/logging/Logger'
import { CodebaseTag } from './codebase-tag'
import { PathObfuscator } from '../encryption'
import { ExtensionConfig } from './types'
import { WorkspaceSync } from './workspace-sync'

export class CodebaseIndexer {
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
