import { useState } from 'react';
import { Boxes, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { RvmAttributeStats, RvmTreeNode } from '../viewer/rvmSdk.js';
import { rvmNodeDisplayPath } from '../viewer/rvmSdk.js';

interface ModelExplorerProps {
  tree: RvmTreeNode;
  selectedNode: RvmTreeNode | null;
  attributeStats: RvmAttributeStats;
  onSelect: (node: RvmTreeNode) => void;
  onClose: () => void;
  open: boolean;
}

export function ModelExplorer({
  tree,
  selectedNode,
  attributeStats,
  onSelect,
  onClose,
  open,
}: ModelExplorerProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(() => new Set([nodeKey(tree)]));

  const toggle = (node: RvmTreeNode): void => {
    const key = nodeKey(node);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className={`rv-dock rv-dock--left${open ? ' rv-dock--open' : ''}`} aria-label="模型结构">
      <header className="rv-dock__header">
        <Boxes aria-hidden="true" size={17} strokeWidth={1.8} />
        <strong>模型结构</strong>
        <button className="rv-dock__close" type="button" aria-label="关闭模型结构" onClick={onClose}>
          <X aria-hidden="true" size={17} />
        </button>
      </header>
      <div className="rv-attribute-summary">
        {attributeStats.loaded
          ? `属性挂接 ${attributeStats.attached.toLocaleString()} · 未匹配 ${attributeStats.missed.toLocaleString()}`
          : '未加载外部属性'}
      </div>
      <div className="rv-tree-scroll">
        <ul className="rv-tree" role="tree" aria-label="RVM 节点层级">
          <TreeItem
            node={tree}
            selectedNode={selectedNode}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={toggle}
          />
        </ul>
      </div>
    </aside>
  );
}

interface TreeItemProps {
  node: RvmTreeNode;
  selectedNode: RvmTreeNode | null;
  expanded: Set<string>;
  onSelect: (node: RvmTreeNode) => void;
  onToggle: (node: RvmTreeNode) => void;
}

function TreeItem({ node, selectedNode, expanded, onSelect, onToggle }: TreeItemProps): React.JSX.Element {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(nodeKey(node));
  const isSelected = selectedNode ? nodeKey(selectedNode) === nodeKey(node) : false;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected}>
      <div className={`rv-tree__row${isSelected ? ' rv-tree__row--selected' : ''}`}>
        {hasChildren ? (
          <button
            className="rv-tree__toggle"
            type="button"
            aria-label={`${isExpanded ? '收起' : '展开'} ${node.name}`}
            onClick={() => onToggle(node)}
          >
            {isExpanded ? (
              <ChevronDown aria-hidden="true" size={15} />
            ) : (
              <ChevronRight aria-hidden="true" size={15} />
            )}
          </button>
        ) : (
          <span className="rv-tree__spacer" aria-hidden="true" />
        )}
        <button
          className="rv-tree__select"
          type="button"
          title={rvmNodeDisplayPath(node)}
          onClick={() => onSelect(node)}
        >
          <span>{node.name || '(未命名节点)'}</span>
          {node.propertyCount > 0 ? <small>{node.propertyCount}</small> : null}
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <ul role="group">
          {node.children.map((child) => (
            <TreeItem
              key={nodeKey(child)}
              node={child}
              selectedNode={selectedNode}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function nodeKey(node: RvmTreeNode): string {
  return JSON.stringify(node.segments);
}
