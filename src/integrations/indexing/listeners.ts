import * as vscode from 'vscode'
import { Logger } from '../../services/logging/Logger'
import { CodebaseIndexer } from './sync'
import type { GitExtension } from '../../api/extensions/git'

export const setupCodebaseIndexingListeners = (context: vscode.ExtensionContext, codebaseIndexer: CodebaseIndexer) => {
    // Launch initial sync
    codebaseIndexer.sync(true)

    // Regular file changes, throttle sync
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => {
            codebaseIndexer.sync()
        })
    )

    // File creation/deletion, invalidate caches and reindex
    const invalidateAndReindex = () => {
        codebaseIndexer.invalidateCaches()
        codebaseIndexer.sync()
    }
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(invalidateAndReindex))
    context.subscriptions.push(vscode.workspace.onDidDeleteFiles(invalidateAndReindex))

    // Get Git extension
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')
    if (!gitExtension) {
        Logger.log('Git extension not found')
        return
    }

    function setupBranchWatchers() {
        if (!gitExtension) {
            return
        }

        try {
            const git = gitExtension.exports.getAPI(1)

            // Save current branches to detect changes
            const currentBranches = new Map<string, string | undefined>()
            git.repositories.forEach((repo) => {
                currentBranches.set(repo.rootUri.toString(), repo.state.HEAD?.name)
            })

            // Listen for repository state changes
            git.onDidChangeState(() => {
                let reindex = false

                for (const repo of git.repositories) {
                    const repoPath = repo.rootUri.toString()
                    const newBranch = repo.state.HEAD?.name

                    // If branch changed
                    if (currentBranches.get(repoPath) !== newBranch) {
                        const oldBranch = currentBranches.get(repoPath)
                        currentBranches.set(repoPath, newBranch)

                        // Log the branch change
                        Logger.log(
                            `Git branch changed in ${repoPath}: ${oldBranch || 'unknown'} → ${newBranch || 'unknown'}`
                        )

                        // Trigger a reindex once
                        reindex = true
                    }
                }

                if (reindex) {
                    // If git branch has changed, we want to reset the indexer tags.
                    codebaseIndexer.init().then(() => {
                        codebaseIndexer.invalidateCaches()
                        codebaseIndexer.sync()
                    })
                }
            })

            Logger.log('Git branch change listener initialized')
        } catch (error) {
            Logger.log(`Error setting up git branch watchers: ${error}`)
        }
    }

    if (!gitExtension.isActive) {
        gitExtension.activate().then(setupBranchWatchers, (err) => {
            Logger.log(`Failed to activate Git extension: ${err}`)
        })
    } else {
        setupBranchWatchers()
    }
}
