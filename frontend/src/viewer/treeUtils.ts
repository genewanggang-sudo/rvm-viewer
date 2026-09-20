import type { RvmTreeNode } from './rvmSdk.js';

/** 树节点唯一键：索引路径（同名兄弟节点无法用 segments 区分，见联动设计文档 3/4.5 节）。 */
export const TREE_ROOT_KEY = '0';

export function childKey(parentKey: string, index: number): string {
  return `${parentKey}/${index}`;
}

/** 根到目标节点的孩子索引路径（按对象同一性查找；找不到返回 null）。 */
export function findIndexPath(root: RvmTreeNode, target: RvmTreeNode): number[] | null {
  if (root === target) return [];

  const search = (node: RvmTreeNode, prefix: number[]): number[] | null => {
    for (let index = 0; index < node.children.length; index += 1) {
      const path = [...prefix, index];
      const child = node.children[index];
      if (child === target || search(child, path) !== null) return path;
    }
    return null;
  };

  return search(root, []);
}

/** 索引路径对应的节点键链（含根键），用于展开祖先链。 */
export function indexPathKeys(path: number[]): string[] {
  const keys: string[] = [TREE_ROOT_KEY];
  let key = TREE_ROOT_KEY;
  for (const index of path) {
    key = childKey(key, index);
    keys.push(key);
  }
  return keys;
}
