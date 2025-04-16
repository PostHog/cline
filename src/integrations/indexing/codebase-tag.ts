import * as vscode from 'vscode'
import { promisify } from 'util'
import { exec } from 'child_process'
import { createHash } from 'crypto'

const execAsync = promisify(exec)

export interface WorkspaceBranchHash {
    dir: vscode.Uri
    branchHash: string
}

export class CodebaseTag {
    async getTags(): Promise<WorkspaceBranchHash[]> {
        const workspaceDirs = await this.getWorkspaceDirs()
        const branches = await Promise.all(workspaceDirs.map((dir) => this.getBranch(dir)))
        return workspaceDirs.map((dir, i) => ({
            dir,
            branchHash: this.hash(branches[i]),
        }))
    }

    async getBranch(forDirectory: vscode.Uri): Promise<string> {
        try {
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
                cwd: forDirectory.fsPath,
            })
            return stdout?.trim() || ''
        } catch (e) {
            return ''
        }
    }

    async getWorkspaceDirs() {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders) {
            return []
        }
        return workspaceFolders.map((folder) => folder.uri)
    }

    private hash(branch: string) {
        return createHash('sha256').update(branch).digest('hex')
    }
}
