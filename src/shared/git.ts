import * as vscode from 'vscode'

import type { GitExtension } from '../api/extensions/git'
import { Logger } from '../services/logging/Logger'

export async function getGitExtensionApi() {
    // Get Git extension
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')
    if (!gitExtension) {
        Logger.log('Git extension not found')
        return
    }

    // Check if extension is active, if not activate it
    const activatedExtension = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate()
    const api = activatedExtension.getAPI(1)
    return api
}
