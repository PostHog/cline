import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect } from 'chai'
import * as os from 'os'
import * as path from 'path'

import { MerkleTreeNode } from '../merkle-tree-node'

describe('MerkleTreeNode', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merkle-tree-test-'))
    })

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('should throw if hash is not calculated', () => {
        const node = new MerkleTreeNode('test', 'file')
        expect(() => node.hash).to.throw('Hash is not calculated')
    })

    it('should return correct extension without dot', () => {
        const nodeJs = new MerkleTreeNode('file.js', 'file')
        expect(nodeJs.extension).to.equal('js')

        const nodeTxt = new MerkleTreeNode('file.txt', 'file')
        expect(nodeTxt.extension).to.equal('txt')

        const nodeNoExt = new MerkleTreeNode('file', 'file')
        expect(nodeNoExt.extension).to.be.null

        const nodeDir = new MerkleTreeNode('dir', 'dir')
        expect(nodeDir.extension).to.be.null
    })

    it('should correctly build hashes for a tree structure', async () => {
        // Create file1
        const file1Path = `file://${path.join(tempDir, 'file1.txt')}`
        await fs.writeFile(fileURLToPath(file1Path), 'content1')

        // Create subdir and file2
        const subdirPath = path.join(tempDir, 'subdir')
        await fs.mkdir(subdirPath)
        const file2Path = `file://${path.join(subdirPath, 'file2.txt')}`
        await fs.writeFile(fileURLToPath(file2Path), 'content2')

        // Create tree structure
        const file1Node = new MerkleTreeNode(file1Path, 'file')
        const file2Node = new MerkleTreeNode(file2Path, 'file')
        const subdirNode = new MerkleTreeNode(`file://${subdirPath}`, 'dir', [file2Node])
        const rootNode = new MerkleTreeNode(`file://${tempDir}`, 'dir', [file1Node, subdirNode])

        // Build hashes
        await rootNode.buildHashes()

        // Check that all nodes have hashes calculated
        expect(file1Node.hash).to.be.a('string')
        expect(file2Node.hash).to.be.a('string')
        expect(subdirNode.hash).to.be.a('string')
        expect(rootNode.hash).to.be.a('string')

        // Verify file hashes are based on content
        const file1Content = await fs.readFile(fileURLToPath(file1Path))
        const expectedFile1Hash = require('crypto').createHash('sha256').update(file1Content).digest('hex')
        expect(file1Node.hash).to.equal(expectedFile1Hash)

        // Make sure different files have different hashes
        expect(file1Node.hash).to.not.equal(file2Node.hash)

        // Make sure the directory hash is dependent on its children
        const newSubdirNode = new MerkleTreeNode(`file://${subdirPath}`, 'dir', [file2Node])
        await newSubdirNode.buildHashes()
        expect(newSubdirNode.hash).to.equal(subdirNode.hash)
    })

    it('should read file content correctly', async () => {
        const filePath = `file://${path.join(tempDir, 'test-read.txt')}`
        const content = 'test content for reading'
        await fs.writeFile(fileURLToPath(filePath), content)

        const node = new MerkleTreeNode(filePath, 'file')
        const fileContent = await node.read()

        expect(fileContent.toString()).to.equal(content)
    })

    it('should throw when reading a directory', async () => {
        const dirNode = new MerkleTreeNode(`file://${tempDir}`, 'dir')

        try {
            await dirNode.read()
            expect.fail('Should have thrown an error')
        } catch (e) {
            expect(e.message).to.equal('Cannot read non-file node')
        }
    })

    it('toTreeNodes should exclude excluded nodes', async () => {
        // Setup a tree with some excluded nodes
        const file1Node = new MerkleTreeNode('file1.txt', 'file')
        file1Node.excluded = true // Mark as excluded

        const file2Node = new MerkleTreeNode('file2.txt', 'file')
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(file2Node, 'calculatedHash', { value: 'file2hash' })

        const file3Node = new MerkleTreeNode('file3.txt', 'file')
        file3Node.excluded = true // Mark as excluded

        const subdirNode = new MerkleTreeNode('subdir', 'dir', [file2Node, file3Node])
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(subdirNode, 'calculatedHash', { value: 'subdirhash' })

        const rootNode = new MerkleTreeNode('root', 'dir', [file1Node, subdirNode])
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(rootNode, 'calculatedHash', { value: 'roothash' })

        // Convert to tree nodes
        const treeNodes = Array.from(rootNode.toTreeNodes())

        // Verify excluded nodes are not in the result
        expect(treeNodes.length).to.equal(3) // root, subdir, file2 (file1 and file3 are excluded)

        // Verify the ids (hashes) of included nodes
        const nodeIds = treeNodes.map((node) => node.id)
        expect(nodeIds).to.include('roothash')
        expect(nodeIds).to.include('subdirhash')
        expect(nodeIds).to.include('file2hash')

        // Verify the structure - parent relationships
        const rootTreeNode = treeNodes.find((n) => n.id === 'roothash')
        const subdirTreeNode = treeNodes.find((n) => n.id === 'subdirhash')
        const file2TreeNode = treeNodes.find((n) => n.id === 'file2hash')

        expect(rootTreeNode?.parent_id).to.be.undefined
        expect(subdirTreeNode?.parent_id).to.equal('roothash')
        expect(file2TreeNode?.parent_id).to.equal('subdirhash')
    })

    it('toLeafNodesMap should exclude excluded nodes', async () => {
        // Setup a tree with some excluded nodes
        const file1Node = new MerkleTreeNode('file1.txt', 'file')
        file1Node.excluded = true // Mark as excluded
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(file1Node, 'calculatedHash', { value: 'file1hash' })

        const file2Node = new MerkleTreeNode('file2.txt', 'file')
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(file2Node, 'calculatedHash', { value: 'file2hash' })

        const file3Node = new MerkleTreeNode('file3.txt', 'file')
        file3Node.excluded = true // Mark as excluded
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(file3Node, 'calculatedHash', { value: 'file3hash' })

        const subdirNode = new MerkleTreeNode('subdir', 'dir', [file2Node, file3Node])
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(subdirNode, 'calculatedHash', { value: 'subdirhash' })

        const file4Node = new MerkleTreeNode('file4.txt', 'file')
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(file4Node, 'calculatedHash', { value: 'file4hash' })

        const rootNode = new MerkleTreeNode('root', 'dir', [file1Node, subdirNode, file4Node])
        // Add calculatedHash to avoid error when accessing hash property
        Object.defineProperty(rootNode, 'calculatedHash', { value: 'roothash' })

        // Get leaf nodes map
        const leafNodesMap = rootNode.toLeafNodesMap()

        // Verify map only contains non-excluded file nodes
        expect(leafNodesMap.size).to.equal(2) // Only file2 and file4 should be included
        expect(leafNodesMap.has('file1hash')).to.be.false
        expect(leafNodesMap.has('file2hash')).to.be.true
        expect(leafNodesMap.has('file3hash')).to.be.false
        expect(leafNodesMap.has('file4hash')).to.be.true
        expect(leafNodesMap.has('subdirhash')).to.be.false // Not a leaf node
        expect(leafNodesMap.has('roothash')).to.be.false // Not a leaf node

        // Verify the objects in the map are the actual node references
        expect(leafNodesMap.get('file2hash')).to.equal(file2Node)
        expect(leafNodesMap.get('file4hash')).to.equal(file4Node)
    })
})
