import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import ignore, { Ignore } from 'ignore'
import limit from 'p-limit'
import { FileType } from 'vscode'

import { ignoreDirsAndFiles } from '../../utils/exclusions'
import { joinPathsToUri } from '../../utils/uri'
import { MerkleTreeNode } from './merkle-tree-node'

type Entry = [string, FileType]

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

async function listDir(dir: string): Promise<[string, FileType][]> {
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

export class MerkleTreeWalker {
    timings: Record<string, number>
    childrenLimit = limit(10)
    private readonly LIST_DIR_CACHE_TIME = 30_000 // 30 seconds
    private readonly IGNORE_FILE_CACHE_TIME = 30_000 // 30 seconds

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
    public async buildTree(): Promise<MerkleTreeNode> {
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
        const rootNode = new MerkleTreeNode(this.uri, 'dir')

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
            if (cachedListdir && cachedListdir.time > Date.now() - this.LIST_DIR_CACHE_TIME) {
                entries = await cachedListdir.entries
                this.timings.listDirCacheHits++
            } else {
                const promise = listDir(cur.walkableEntry.uri)
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
            if (cachedIgnore && cachedIgnore.time > Date.now() - this.IGNORE_FILE_CACHE_TIME) {
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
                        const dirNode = new MerkleTreeNode(walkableEntry.uri, 'dir')

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
                        currentNode.children.push(new MerkleTreeNode(walkableEntry.uri, 'file'))
                    }
                })
            )

            await Promise.all(childrenPromises)
        }

        return rootNode.buildHashes()
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

    private entryIsDirectory(entry: Entry) {
        return entry[1] === FileType.Directory
    }

    private entryIsSymlink(entry: Entry) {
        return entry[1] === FileType.SymbolicLink
    }
}

function getGitIgnoreArrayFromFile(file: string) {
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
    // These are done separately so that .posthogignore can override .gitignore
    const gitIgnoreFile = dirFiles.find((name) => name === '.gitignore')
    const editorIgnoreFile = dirFiles.find((name) => name === '.posthogignore')

    const getGitIgnorePatterns = async () => {
        if (gitIgnoreFile) {
            const contents = await readFile(`${currentDir}/.gitignore`)
            return getGitIgnoreArrayFromFile(contents)
        }
        return []
    }

    const getEditorIgnorePatterns = async () => {
        if (editorIgnoreFile) {
            const contents = await readFile(`${currentDir}/.posthogignore`)
            return getGitIgnoreArrayFromFile(contents)
        }
        return []
    }

    const ignoreArrays = await Promise.all([getGitIgnorePatterns(), getEditorIgnorePatterns()])

    if (ignoreArrays[0].length === 0 && ignoreArrays[1].length === 0) {
        return defaultAndGlobalIgnores
    }

    // Note precedence here!
    const ignoreContext = ignore()
        .add(ignoreArrays[0]) // gitignore
        .add(defaultAndGlobalIgnores) // default file/folder ignores followed by global .posthogignore
        .add(ignoreArrays[1]) // local .posthogignore

    return ignoreContext
}
