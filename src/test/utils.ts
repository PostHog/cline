import * as vscode from 'vscode'

export function resetExtensionState(extension: vscode.ExtensionContext, secrets: string[] = []) {
    for (const key of extension.globalState.keys()) {
        extension.globalState.update(key, undefined)
    }
    for (const key of extension.workspaceState.keys()) {
        extension.workspaceState.update(key, undefined)
    }
    for (const key of secrets) {
        extension.secrets.delete(key)
    }
}
