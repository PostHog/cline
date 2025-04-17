import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import { createHash } from 'crypto'
import { TreeNode, TreeNodeType } from './types'
import { isBinaryFile } from 'isbinaryfile'
import { extname } from 'node:path'

export class MerkleTreeNode {
    private calculatedHash: string | null = null

    /**
     * Flag indicating that the node is excluded from the tree.
     * This typically happens when the node is a binary file.
     */
    public excluded: boolean = false

    constructor(
        readonly path: string,
        readonly type: TreeNodeType,
        readonly children: MerkleTreeNode[] = []
    ) {}

    async buildHashes() {
        // Leaf node. Calculate hash immediately.
        if (this.type === 'file') {
            const hashCandidate = await this.generateFileHash()
            if (hashCandidate === null) {
                this.excluded = true
            } else {
                this.calculatedHash = hashCandidate
            }
            return this
        }

        // First calculate hashes for all child directories recursively
        for (const child of this.children) {
            await child.buildHashes()
        }

        // Now compute hash based on children's hashes and names
        const hasher = createHash('sha256').update(this.path)

        // Sort children by path to ensure deterministic hashing
        this.children.sort((a, b) => a.path.localeCompare(b.path))

        for (const child of this.children) {
            // Skip if the child is a binary
            if (child.excluded) {
                continue
            }

            // Combine path and hash to create the directory hash
            hasher.update(child.path)
            hasher.update(child.hash)
        }

        this.calculatedHash = hasher.digest('hex')
        return this
    }

    get hash() {
        if (!this.calculatedHash) {
            throw new Error('Hash is not calculated')
        }
        return this.calculatedHash
    }

    get extension() {
        if (this.type !== 'file') {
            return null
        }

        const ext = extname(this.path)
        if (!ext) {
            return null
        }

        return ext.slice(1)
    }

    /**
     * Traverse the tree and convert it to the `TreeNode` objects.
     * @param parentId - The parent node id.
     * @returns A generator of tree nodes.
     */
    *toTreeNodes(parentId?: string): Generator<TreeNode> {
        yield this.toTreeNode(parentId)
        for (const child of this.children) {
            if (child.excluded) {
                continue
            }
            yield* child.toTreeNodes(this.hash)
        }
    }

    /**
     * Returns a map of all leaf nodes in the tree (files).
     * @returns A map where the key is the hash of the file and the value is the file node.
     */
    toLeafNodesMap(): Map<string, MerkleTreeNode> {
        const map = new Map<string, MerkleTreeNode>()

        function dfs(node: MerkleTreeNode) {
            if (node.type === 'file' && !node.excluded) {
                map.set(node.hash, node)
            }

            for (const child of node.children) {
                if (child.excluded) {
                    continue
                }

                dfs(child)
            }
        }

        dfs(this)
        return map
    }

    async read(): Promise<Buffer> {
        if (this.type !== 'file') {
            throw new Error('Cannot read non-file node')
        }

        const filePath = fileURLToPath(this.path)
        const content = await fs.readFile(filePath)
        return content
    }

    private toTreeNode(parentId?: string): TreeNode {
        return {
            id: this.hash,
            type: this.type,
            parent_id: parentId,
        }
    }

    private async generateFileHash() {
        try {
            const fileContent = await this.read()
            const isBinary = await isBinaryFile(fileContent)
            if (isBinary) {
                return null
            }
            return createHash('sha256').update(fileContent).digest('hex')
        } catch (e) {
            return null
        }
    }
}
