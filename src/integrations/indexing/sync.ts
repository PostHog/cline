import * as vscode from 'vscode'
import PQueue from 'p-queue'
import pDebounce from 'p-debounce'
import { PathObfuscator } from '../encryption'
import { ExtensionConfig } from './types'
import { WorkspaceSync } from './workspace-sync'
import { Logger } from '../../services/logging/Logger'
import { walkDirCache } from './walker'
import { getGitExtensionApi } from '../../shared/git'
import { API as GitExtensionAPI } from '../../api/extensions/git'

export class CodebaseIndexer implements vscode.Disposable {
    private initialized: boolean = false
    private context: vscode.ExtensionContext
    private config: ExtensionConfig
    private pathObfuscator: PathObfuscator
    private disposables: vscode.Disposable[] = []
    private repoBranches: Map<string, string | undefined> = new Map()

    private workspaceSyncServices: Map<string, WorkspaceSync>

    private syncLocked: boolean = false

    constructor(context: vscode.ExtensionContext, config: ExtensionConfig, pathObfuscator: PathObfuscator) {
        this.context = context
        this.config = config
        this.workspaceSyncServices = new Map()
        this.pathObfuscator = pathObfuscator
    }

    async init() {
        // Regular file changes, throttle sync
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(() => {
                this.sync()
            })
        )

        // File creation/deletion, invalidate caches and reindex
        const invalidateAndReindex = () => {
            this.invalidateCaches()
            this.sync()
        }
        this.disposables.push(vscode.workspace.onDidCreateFiles(invalidateAndReindex))
        this.disposables.push(vscode.workspace.onDidDeleteFiles(invalidateAndReindex))

        // Register Git listeners, so we can reindex when the branch changes
        const git = await getGitExtensionApi()
        if (git) {
            await this.initGit(git)
        }

        // Register workspace sync services
        await this.createWorkspaceSyncServices()

        // Trigger initial sync
        this.sync()

        return this
    }

    dispose() {
        this.disposables.forEach((disposable) => disposable.dispose())
    }

    private async initGit(git: GitExtensionAPI) {
        // Make sure we don't recreate and sync too often
        const debouncedSync = pDebounce(async () => {
            await this.recreateWorkspaceSyncServices()
            await this.sync()
        }, 5000)

        for (const repo of git.repositories) {
            if (repo.state.HEAD?.commit) {
                this.repoBranches.set(repo.rootUri.toString(), repo.state.HEAD.commit)
            }

            this.disposables.push(
                repo.state.onDidChange(() => {
                    const newBranch = repo.state.HEAD?.commit
                    const oldBranch = this.repoBranches.get(repo.rootUri.toString())

                    if (newBranch !== oldBranch) {
                        this.repoBranches.set(repo.rootUri.toString(), newBranch)
                        debouncedSync()
                    }
                })
            )
        }
    }

    private async recreateWorkspaceSyncServices() {
        this.initialized = false
        this.invalidateCaches()
        try {
            await this.createWorkspaceSyncServices()
            this.initialized = true
        } catch (e) {
            Logger.log(`Error reinitializing codebase indexer: ${e}`)
        }
    }

    private async createWorkspaceSyncServices() {
        const workspaceDirs = this.getWorkspaceDirs()
        const services = await Promise.all(
            workspaceDirs.map(async (workspaceDir) => {
                const workspaceSync = new WorkspaceSync(
                    this.context,
                    this.config,
                    workspaceDir.toString(),
                    this.repoBranches.get(workspaceDir.toString()) || ''
                )
                await workspaceSync.init()
                return [workspaceDir.toString(), workspaceSync] as [string, WorkspaceSync]
            })
        )

        this.workspaceSyncServices = new Map(services)
    }

    /**
     * Gets all workspace folder URIs from the current VS Code workspace.
     * @returns Promise resolving to an array of workspace folder URIs
     */
    private getWorkspaceDirs() {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders) {
            return []
        }
        return workspaceFolders.map((folder) => folder.uri)
    }

    private async sync(forceIndex = false) {
        if (!this.initialized) {
            await this.recreateWorkspaceSyncServices()
        }

        try {
            await this.traverseWorkspaces(forceIndex)
        } catch (e) {
            Logger.log(`Error syncing codebase: ${e}`)
        }
    }

    private invalidateCaches() {
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
                        message: `Indexing file ${processedCount} of ${fileCount}...`,
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
