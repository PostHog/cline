export type TreeNodeType = 'file' | 'dir'

export interface TreeNode {
    id: string
    parent_id?: string
    type: TreeNodeType
}
