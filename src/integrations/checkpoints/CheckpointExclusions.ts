import fs from 'fs/promises'
import { join } from 'path'
import { fileExistsAtPath } from '../../utils/fs'
import { getDefaultExclusions } from '../../utils/exclusions'

/**
 * CheckpointExclusions Module
 *
 * A specialized module within PostHog's Checkpoints system that manages file exclusion rules
 * for the checkpoint tracking process. It provides:
 *
 * File Filtering:
 * - File types (build artifacts, media, cache files, etc.)
 * - Git LFS patterns from workspace
 * - Environment and configuration files
 * - Temporary and cache files
 *
 * Git Integration:
 * - Seamless integration with Git's exclude mechanism
 * - Support for workspace-specific LFS patterns
 * - Automatic pattern updates during checkpoints
 *
 * The module ensures efficient checkpoint creation by preventing unnecessary tracking
 * of large files, binary files, and temporary artifacts while maintaining a clean
 * and organized checkpoint history.
 */

/**
 * Writes the combined exclusion patterns to Git's exclude file.
 * Creates the info directory if it doesn't exist.
 *
 * @param gitPath - Path to the .git directory
 * @param lfsPatterns - Optional array of Git LFS patterns to include
 */
export const writeExcludesFile = async (gitPath: string, lfsPatterns: string[] = []): Promise<void> => {
    const excludesPath = join(gitPath, 'info', 'exclude')
    await fs.mkdir(join(gitPath, 'info'), { recursive: true })

    const patterns = getDefaultExclusions(lfsPatterns)
    await fs.writeFile(excludesPath, patterns.join('\n'))
}

/**
 * Retrieves Git LFS patterns from the workspace's .gitattributes file.
 * Returns an empty array if no patterns found or file doesn't exist.
 *
 * @param workspacePath - Path to the workspace root
 * @returns Array of Git LFS patterns found in .gitattributes
 */
export const getLfsPatterns = async (workspacePath: string): Promise<string[]> => {
    try {
        const attributesPath = join(workspacePath, '.gitattributes')
        if (await fileExistsAtPath(attributesPath)) {
            const attributesContent = await fs.readFile(attributesPath, 'utf8')
            return attributesContent
                .split('\n')
                .filter((line) => line.includes('filter=lfs'))
                .map((line) => line.split(' ')[0].trim())
        }
    } catch (error) {
        console.warn('Failed to read .gitattributes:', error)
    }
    return []
}
