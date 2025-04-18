import * as vscode from 'vscode'
import { promisify } from 'util'
import { exec } from 'child_process'
import { createHash } from 'crypto'

const execAsync = promisify(exec)

export interface WorkspaceBranchHash {
    dir: vscode.Uri
    branchHash: string
}

/**
 * Calculates a hash of the current branch for each workspace folder.
 * This is used to identify the workspace folder and branch when syncing.
 */
export class WorkspaceTags {
    /**
     * Gets branch hash information for each workspace folder.
     * @returns Promise resolving to an array of objects containing directory and branch hash
     */
    async getTags(): Promise<WorkspaceBranchHash[]> {
        const workspaceDirs = await this.getWorkspaceDirs()
        const branches = await Promise.all(workspaceDirs.map((dir) => this.getBranch(dir)))
        return workspaceDirs.map((dir, i) => ({
            dir,
            branchHash: this.hash(branches[i]),
        }))
    }

    /**
     * Gets the current git branch name for a specified directory.
     * @param forDirectory The directory URI to check branch for
     * @returns Promise resolving to the branch name or empty string if not in a git repository
     */
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

    /**
     * Gets all workspace folder URIs from the current VS Code workspace.
     * @returns Promise resolving to an array of workspace folder URIs
     */
    async getWorkspaceDirs() {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders) {
            return []
        }
        return workspaceFolders.map((folder) => folder.uri)
    }

    /**
     * Creates a SHA-256 hash from a branch name string.
     * @param branch The branch name to hash
     * @returns Hexadecimal string representation of the hash
     */
    private hash(branch: string) {
        return createHash('sha256').update(branch).digest('hex')
    }
}
