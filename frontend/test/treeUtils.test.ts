import { describe, expect, it } from 'vitest';
import type { RvmTreeNode } from '../src/viewer/rvmSdk.js';
import {
  buildGeometryIndex,
  childKey,
  findIndexPath,
  indexPathKeys,
  TREE_ROOT_KEY,
} from '../src/viewer/treeUtils.js';

function node(name: string, children: RvmTreeNode[] = []): RvmTreeNode {
  return {
    name,
    segments: [name],
    visible: true,
    excluded: false,
    entityCount: 0,
    propertyCount: 0,
    children,
  };
}

const deepTree: RvmTreeNode = node('RootNode', [
  node('/WD1-PSUP', [node('/PS/WD1/0007', [node('BOX 1'), node('BOX 2')]), node('/PS/WD1/0008')]),
  node('/WD2-PSUP'),
]);

describe('treeUtils', () => {
  it('finds the full index path to deeply nested nodes', () => {
    const root = deepTree;
    const world = root.children[0];
    const zone = world.children[0];
    const box2 = zone.children[1];

    expect(findIndexPath(root, root)).toEqual([]);
    expect(findIndexPath(root, world)).toEqual([0]);
    expect(findIndexPath(root, zone)).toEqual([0, 0]);
    expect(findIndexPath(root, box2)).toEqual([0, 0, 1]);
    expect(findIndexPath(root, root.children[1])).toEqual([1]);
  });

  it('returns null for nodes outside the tree and distinguishes clones', () => {
    expect(findIndexPath(deepTree, { ...deepTree.children[0] })).toBeNull();
    const missing = node('/PS/WD1/9999');
    expect(findIndexPath(deepTree, missing)).toBeNull();
  });

  it('resolves same-named siblings by identity, not by name', () => {
    const twins = node('ROOT', [node('SCTN', [node('')]), node('SCTN', [node('')])]);
    const firstEmpty = twins.children[0].children[0];
    const secondEmpty = twins.children[1].children[0];

    expect(findIndexPath(twins, firstEmpty)).toEqual([0, 0]);
    expect(findIndexPath(twins, secondEmpty)).toEqual([1, 0]);
  });

  it('builds key chains from index paths', () => {
    expect(indexPathKeys([0, 0, 1])).toEqual([
      TREE_ROOT_KEY,
      childKey(TREE_ROOT_KEY, 0),
      childKey(childKey(TREE_ROOT_KEY, 0), 0),
      childKey(childKey(childKey(TREE_ROOT_KEY, 0), 0), 1),
    ]);
    expect(indexPathKeys([])).toEqual([TREE_ROOT_KEY]);
  });

  it('marks nodes whose whole subtree has no 3D entities', () => {
    // 模拟 RVM 组织节点：DRAWING / Notes 空组挂在有实体的结构下
    const entity = (name: string): RvmTreeNode => ({ ...node(name), entityCount: 1 });
    const drawing = node('DRAWING 1 of STRUCTURE');
    const notes = node('Notes');
    const structure = node('/PS/WD1/0001', [drawing, notes, entity('BOX 1')]);
    structure.entityCount = 3; // 自身也有实体，但不能因此跳过子级遍历
    const treeWithEmpty = node('RootNode', [structure]);

    const index = buildGeometryIndex(treeWithEmpty);
    expect(index.get(treeWithEmpty)).toBe(true);
    expect(index.get(structure)).toBe(true);
    expect(index.get(structure.children[2])).toBe(true);
    expect(index.get(drawing)).toBe(false);
    expect(index.get(notes)).toBe(false);
  });
});
