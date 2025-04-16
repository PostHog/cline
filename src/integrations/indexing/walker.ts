import ignore, { Ignore } from 'ignore'
import { joinPathsToUri } from '../../utils/uri'
import { ignoreDirsAndFiles } from '../../utils/exclusions'
import { FileType } from 'vscode'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import { createHash } from 'crypto'
import limit from 'p-limit'

export interface WalkerOptions {
    include?: 'dirs' | 'files' | 'both'
    returnRelativeUrisPaths?: boolean
    source?: string
    overrideDefaultIgnores?: Ignore
    recursive?: boolean
}

export interface MerkleNode {
    path: string
    type: 'file' | 'directory'
    hash: string
    children: MerkleNode[]
}

type Entry = [string, FileType]

const LIST_DIR_CACHE_TIME = 30_000 // 30 seconds
const IGNORE_FILE_CACHE_TIME = 30_000 // 30 seconds

// helper struct used for the DFS walk
interface WalkableEntry {
    name: string
    relativeUriPath: string
    uri: string
    type: FileType
    entry: Entry
}

interface IgnoreContext {
    ignore: Ignore
    dirname: string
}

// helper struct used for the DFS walk
interface WalkContext {
    walkableEntry: WalkableEntry
    ignoreContexts: IgnoreContext[]
}

class WalkDirCache {
    dirListCache: Map<
        string,
        {
            time: number
            entries: Promise<[string, FileType][]>
        }
    > = new Map()
    dirIgnoreCache: Map<
        string,
        {
            time: number
            ignore: Promise<Ignore>
        }
    > = new Map()
    // The super safe approach for now
    invalidate() {
        this.dirListCache.clear()
        this.dirIgnoreCache.clear()
    }
}
export const walkDirCache = new WalkDirCache()

async function readFile(fileUri: string): Promise<string> {
    const filepath = fileURLToPath(fileUri)
    return fs.readFile(filepath, 'utf8')
}

export class MerkleTreeWalker {
    timings: Record<string, number>
    childrenLimit = limit(10)

    constructor(private readonly uri: string) {
        this.timings = {
            start: 0,
            dirs: 0,
            ignoreFileTime: 0,
            ignoreTime: 0,
            listDirTime: 0,
            listDirCacheHits: 0,
            ignoreCacheHits: 0,
        }
    }

    // Build a merkle tree from the directory structure
    public async buildMerkleTree(): Promise<MerkleNode> {
        this.timings.start = Date.now()

        // Get default ignores
        let section = Date.now()
        const defaultAndGlobalIgnores = ignore().add(ignoreDirsAndFiles)
        this.timings.ignoreFileTime = Date.now() - section

        // Create the root context for the tree traversal
        const rootContext: WalkContext = {
            walkableEntry: {
                name: '',
                relativeUriPath: '',
                uri: this.uri,
                type: FileType.Directory,
                entry: ['', FileType.Directory],
            },
            ignoreContexts: [],
        }

        // This will be our final merkle tree
        const rootNode: MerkleNode = {
            path: this.uri,
            type: 'directory',
            hash: '',
            children: [],
        }

        // Use a stack for DFS traversal
        const stack = [{ context: rootContext, node: rootNode }]

        for (let current = stack.pop(); current; current = stack.pop()) {
            const { context: cur, node: currentNode } = current

            // Only directories will be added to the stack
            this.timings.dirs++

            // Get directory contents
            section = Date.now()
            let entries: [string, FileType][] = []
            const cachedListdir = walkDirCache.dirListCache.get(cur.walkableEntry.uri)
            if (cachedListdir && cachedListdir.time > Date.now() - LIST_DIR_CACHE_TIME) {
                entries = await cachedListdir.entries
                this.timings.listDirCacheHits++
            } else {
                const promise = this.listDir(cur.walkableEntry.uri)
                walkDirCache.dirListCache.set(cur.walkableEntry.uri, {
                    time: Date.now(),
                    entries: promise,
                })
                entries = await promise
            }
            this.timings.listDirTime += Date.now() - section

            // Process ignore files
            section = Date.now()
            let newIgnore: Ignore
            const cachedIgnore = walkDirCache.dirIgnoreCache.get(cur.walkableEntry.uri)
            if (cachedIgnore && cachedIgnore.time > Date.now() - IGNORE_FILE_CACHE_TIME) {
                newIgnore = await cachedIgnore.ignore
                this.timings.ignoreCacheHits++
            } else {
                const ignorePromise = getIgnoreContext(cur.walkableEntry.uri, entries, defaultAndGlobalIgnores)
                walkDirCache.dirIgnoreCache.set(cur.walkableEntry.uri, {
                    time: Date.now(),
                    ignore: ignorePromise,
                })
                newIgnore = await ignorePromise
            }

            const ignoreContexts = [
                ...cur.ignoreContexts,
                {
                    ignore: newIgnore,
                    dirname: cur.walkableEntry.relativeUriPath,
                },
            ]
            this.timings.ignoreFileTime += Date.now() - section

            // Initialize children array if not already present
            if (!currentNode.children) {
                currentNode.children = []
            }

            // Process each entry in the directory
            const childrenPromises = entries.map((entry) =>
                this.childrenLimit(async () => {
                    if (this.entryIsSymlink(entry)) {
                        // Skip symlinks
                        return
                    }

                    const walkableEntry = {
                        name: entry[0],
                        relativeUriPath: `${cur.walkableEntry.relativeUriPath}${cur.walkableEntry.relativeUriPath ? '/' : ''}${entry[0]}`,
                        uri: joinPathsToUri(cur.walkableEntry.uri, entry[0]),
                        type: entry[1],
                        entry: entry,
                    }

                    let relPath = walkableEntry.relativeUriPath
                    if (this.entryIsDirectory(entry)) {
                        relPath = `${relPath}/`
                    }

                    // Check if the file/directory should be ignored
                    if (this.isPathIgnored(relPath, ignoreContexts)) {
                        return
                    }

                    if (this.entryIsDirectory(entry)) {
                        // Create a new merkle node for this directory
                        const dirNode: MerkleNode = {
                            path: walkableEntry.uri,
                            type: 'directory',
                            hash: '', // Will compute after processing children
                            children: [],
                        }

                        // Add this directory to parent's children
                        currentNode.children.push(dirNode)

                        // Push to stack for DFS traversal
                        stack.push({
                            context: {
                                walkableEntry,
                                ignoreContexts,
                            },
                            node: dirNode,
                        })
                    } else {
                        // For files, compute the hash immediately
                        const filePath = fileURLToPath(walkableEntry.uri)
                        const fileContent = await fs.readFile(filePath)
                        const fileHash = createHash('sha256').update(new Uint8Array(fileContent)).digest('hex')

                        // Create a merkle node for this file
                        const fileNode: MerkleNode = {
                            path: walkableEntry.uri,
                            type: 'file',
                            hash: fileHash,
                            children: [],
                        }

                        // Add this file to parent's children
                        currentNode.children.push(fileNode)
                    }
                })
            )

            await Promise.all(childrenPromises)
        }

        // Now calculate hashes for directories in a bottom-up manner
        await this.calculateDirectoryHashes(rootNode)

        return rootNode
    }

    private isPathIgnored(path: string, ignoreContexts: IgnoreContext[]) {
        const section = Date.now()

        const setTimings = () => {
            this.timings.ignoreTime += Date.now() - section
        }

        for (const ignoreContext of ignoreContexts) {
            const prefixLength = ignoreContext.dirname.length === 0 ? 0 : ignoreContext.dirname.length + 1
            const matchPath = path.substring(prefixLength)
            if (ignoreContext.ignore.ignores(matchPath)) {
                setTimings()
                return true
            }
        }

        setTimings()
        return false
    }

    // Calculate directory hashes based on children's hashes
    private async calculateDirectoryHashes(node: MerkleNode): Promise<void> {
        if (node.type === 'directory' && node.children && node.children.length > 0) {
            // First calculate hashes for all child directories recursively
            for (const child of node.children) {
                if (child.type === 'directory') {
                    await this.calculateDirectoryHashes(child)
                }
            }

            // Now compute hash based on children's hashes and names
            const hasher = createHash('sha256')

            // Sort children by path to ensure deterministic hashing
            node.children.sort((a, b) => a.path.localeCompare(b.path))

            for (const child of node.children) {
                // Combine path and hash to create the directory hash
                hasher.update(child.path)
                hasher.update(child.hash)
            }

            node.hash = hasher.digest('hex')
        }
    }

    async listDir(dir: string): Promise<[string, FileType][]> {
        const filepath = fileURLToPath(dir)
        const contents = await fs.readdir(filepath, { withFileTypes: true })

        const all: [string, FileType][] = contents.map((dirent) => {
            if (dirent.isDirectory()) {
                return [dirent.name, FileType.Directory]
            }

            if (dirent.isSymbolicLink()) {
                return [dirent.name, FileType.SymbolicLink]
            }

            return [dirent.name, FileType.File]
        })

        return all
    }

    private entryIsDirectory(entry: Entry) {
        return entry[1] === FileType.Directory
    }

    private entryIsSymlink(entry: Entry) {
        return entry[1] === FileType.SymbolicLink
    }

    // Original walk method kept for backward compatibility
    public async *walk(): AsyncGenerator<string> {
        const merkleTree = await this.buildMerkleTree()

        // Flatten the merkle tree to return paths in the same format as the original walker
        for await (const path of this.flattenMerkleTree(merkleTree)) {
            yield path
        }
    }

    private async *flattenMerkleTree(node: MerkleNode): AsyncGenerator<string> {
        if (node.type === 'file') {
            yield node.path
        } else if (node.type === 'directory' && node.children) {
            for (const child of node.children) {
                for await (const path of this.flattenMerkleTree(child)) {
                    yield path
                }
            }
        }
    }
}

export function gitIgArrayFromFile(file: string) {
    return file
        .split(/\r?\n/) // Split on new line
        .map((l) => l.trim()) // Remove whitespace
        .filter((l) => !/^#|^$/.test(l)) // Remove empty lines
}

export async function getIgnoreContext(
    currentDir: string,
    currentDirEntries: Entry[],
    defaultAndGlobalIgnores: Ignore
) {
    const dirFiles = currentDirEntries
        .filter(([_, entryType]) => entryType === (1 as FileType.File))
        .map(([name, _]) => name)

    // Find ignore files and get ignore arrays from their contexts
    // These are done separately so that .continueignore can override .gitignore
    const gitIgnoreFile = dirFiles.find((name) => name === '.gitignore')
    const continueIgnoreFile = dirFiles.find((name) => name === '.posthogignore')

    const getGitIgnorePatterns = async () => {
        if (gitIgnoreFile) {
            const contents = await readFile(`${currentDir}/.gitignore`)
            return gitIgArrayFromFile(contents)
        }
        return []
    }

    const getContinueIgnorePatterns = async () => {
        if (continueIgnoreFile) {
            const contents = await readFile(`${currentDir}/.posthogignore`)
            return gitIgArrayFromFile(contents)
        }
        return []
    }

    const ignoreArrays = await Promise.all([getGitIgnorePatterns(), getContinueIgnorePatterns()])

    if (ignoreArrays[0].length === 0 && ignoreArrays[1].length === 0) {
        return defaultAndGlobalIgnores
    }

    // Note precedence here!
    const ignoreContext = ignore()
        .add(ignoreArrays[0]) // gitignore
        .add(defaultAndGlobalIgnores) // default file/folder ignores followed by global .continueignore
        .add(ignoreArrays[1]) // local .continueignore

    return ignoreContext
}
