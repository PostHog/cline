import { expect } from 'chai'
import * as fs from 'node:fs/promises'
import * as path from 'path'
import * as os from 'os'
import { MerkleTreeWalker, walkDirCache } from '../walker'
import { MerkleTreeNode } from '../merkle-tree-node'

describe('MerkleTreeWalker', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-test-'))
        // Clear caches before each test
        walkDirCache.invalidate()
    })

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true })
    })

    /**
     * Helper to create a test file structure
     */
    async function createTestFileStructure() {
        // Create directories
        const srcDir = path.join(tempDir, 'src')
        const testDir = path.join(srcDir, 'test')
        const nodeModulesDir = path.join(tempDir, 'node_modules')
        const libDir = path.join(nodeModulesDir, 'lib')

        await fs.mkdir(srcDir, { recursive: true })
        await fs.mkdir(testDir, { recursive: true })
        await fs.mkdir(nodeModulesDir, { recursive: true })
        await fs.mkdir(libDir, { recursive: true })

        // Create files
        await fs.writeFile(path.join(tempDir, 'package.json'), '{"name":"test"}')
        await fs.writeFile(path.join(srcDir, 'index.ts'), 'export const test = true;')
        await fs.writeFile(path.join(srcDir, 'utils.ts'), 'export function utils() {}')
        await fs.writeFile(path.join(testDir, 'index.test.ts'), 'test("it works", () => {});')
        await fs.writeFile(path.join(libDir, 'helper.js'), 'function helper() {}')

        // Create gitignore
        await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules\n*.log\n.DS_Store\n')

        return `file://${tempDir}`
    }

    it('should build a tree from a directory structure', async () => {
        const rootUri = await createTestFileStructure()
        const walker = new MerkleTreeWalker(rootUri)

        const rootNode = await walker.buildTree()

        // Verify basic properties
        expect(rootNode).to.be.instanceOf(MerkleTreeNode)
        expect(rootNode.type).to.equal('dir')
        expect(rootNode.path).to.equal(rootUri)

        // Verify children
        expect(rootNode.children).to.be.an('array')

        // Find src directory and package.json file
        const srcNode = rootNode.children.find((node) => node.path.endsWith('/src'))
        const packageJsonNode = rootNode.children.find((node) => node.path.endsWith('/package.json'))

        expect(srcNode).to.exist
        expect(srcNode?.type).to.equal('dir')
        expect(packageJsonNode).to.exist
        expect(packageJsonNode?.type).to.equal('file')

        // Check that srcNode has children
        if (srcNode) {
            expect(srcNode.children.length).to.be.greaterThan(0)

            // Find source files
            const indexFile = srcNode.children.find((node) => node.path.endsWith('/index.ts'))
            const utilsFile = srcNode.children.find((node) => node.path.endsWith('/utils.ts'))

            expect(indexFile).to.exist
            expect(utilsFile).to.exist
        }
    })

    it('should handle ignore patterns correctly', async () => {
        const rootUri = await createTestFileStructure()

        // Add a .posthogignore file to override .gitignore
        await fs.writeFile(path.join(tempDir, '.posthogignore'), '*.ts\n!src/index.ts\n')

        const walker = new MerkleTreeWalker(rootUri)
        const rootNode = await walker.buildTree()

        // Find src directory
        const srcNode = rootNode.children.find((node) => node.path.endsWith('/src'))
        expect(srcNode).to.exist

        if (srcNode) {
            // Only index.ts should exist, utils.ts should be ignored due to *.ts pattern with explicit exception
            const indexFile = srcNode.children.find((node) => node.path.endsWith('/index.ts'))
            const utilsFile = srcNode.children.find((node) => node.path.endsWith('/utils.ts'))

            expect(indexFile).to.exist
            expect(utilsFile).to.not.exist
        }
    })

    it('should use caching for directory listings', async () => {
        const rootUri = await createTestFileStructure()

        // Create a walker and build the tree
        const walker = new MerkleTreeWalker(rootUri)
        await walker.buildTree()

        // Check the initial number of cache hits (should be zero or very low)
        const initialCacheHits = walker.timings.listDirCacheHits

        // Create a second walker and build the tree again
        const walker2 = new MerkleTreeWalker(rootUri)
        await walker2.buildTree()

        // The second walker should have more cache hits
        expect(walker2.timings.listDirCacheHits).to.be.greaterThan(initialCacheHits)
    })

    it('should build correct hashes for the tree', async () => {
        const rootUri = await createTestFileStructure()
        const walker = new MerkleTreeWalker(rootUri)

        const rootNode = await walker.buildTree()

        // All nodes should have hashes
        expect(rootNode.hash).to.be.a('string')

        function validateNodeHashes(node: MerkleTreeNode) {
            expect(node.hash).to.be.a('string')
            node.children.forEach((child) => validateNodeHashes(child))
        }

        validateNodeHashes(rootNode)

        // Get the hash of src/index.ts
        const srcNode = rootNode.children.find((node) => node.path.endsWith('/src'))
        let indexNode: MerkleTreeNode | undefined

        if (srcNode) {
            indexNode = srcNode.children.find((node) => node.path.endsWith('/index.ts'))
        }

        // Store the original hashes
        const originalRootHash = rootNode.hash
        const originalSrcHash = srcNode?.hash
        const originalIndexHash = indexNode?.hash

        // Modify the index.ts file
        const indexPath = path.join(tempDir, 'src', 'index.ts')
        await fs.writeFile(indexPath, 'export const test = false;')

        // Rebuild tree and compare hashes
        walkDirCache.invalidate() // Invalidate cache to ensure files are re-read
        const newWalker = new MerkleTreeWalker(rootUri)
        const newRootNode = await newWalker.buildTree()

        // Find the same nodes in the new tree
        const newSrcNode = newRootNode.children.find((node) => node.path.endsWith('/src'))
        let newIndexNode: MerkleTreeNode | undefined

        if (newSrcNode) {
            newIndexNode = newSrcNode.children.find((node) => node.path.endsWith('/index.ts'))
        }

        // Index file hash should change because content changed
        expect(newIndexNode?.hash).to.not.equal(originalIndexHash)

        // Src directory hash should change because a child changed
        expect(newSrcNode?.hash).to.not.equal(originalSrcHash)

        // Root hash should change because a descendant changed
        expect(newRootNode.hash).to.not.equal(originalRootHash)
    })

    it('should exclude node_modules directory when using default ignores', async () => {
        const rootUri = await createTestFileStructure()
        const walker = new MerkleTreeWalker(rootUri)

        const rootNode = await walker.buildTree()

        // Check that node_modules is excluded (due to .gitignore)
        const nodeModulesNode = rootNode.children.find((node) => node.path.endsWith('/node_modules'))
        expect(nodeModulesNode).to.not.exist
    })

    it('should handle nested ignore patterns correctly', async () => {
        const rootUri = await createTestFileStructure()

        // Create a nested .gitignore file with different patterns
        await fs.writeFile(path.join(tempDir, 'src', '.gitignore'), '*.log\n*.ts\n!index.ts\n')

        const walker = new MerkleTreeWalker(rootUri)
        const rootNode = await walker.buildTree()

        // Find src directory
        const srcNode = rootNode.children.find((node) => node.path.endsWith('/src'))
        expect(srcNode).to.exist

        if (srcNode) {
            // Check that only index.ts exists (utils.ts should be ignored)
            const indexFile = srcNode.children.find((node) => node.path.endsWith('/index.ts'))
            const utilsFile = srcNode.children.find((node) => node.path.endsWith('/utils.ts'))

            expect(indexFile).to.exist
            expect(utilsFile).to.not.exist
        }
    })
})
