import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, ChevronDown, ChevronRight, Crosshair, Eye, EyeOff, X } from 'lucide-react';
import type { RvmAttributeStats, RvmTreeNode } from '../viewer/rvmSdk.js';
import { rvmNodeDisplayPath } from '../viewer/rvmSdk.js';
import {
  childKey,
  buildGeometryIndex,
  findIndexPath,
  indexPathKeys,
  TREE_ROOT_KEY,
} from '../viewer/treeUtils.js';

const SEARCH_RESULT_LIMIT = 200;
const DEFAULT_TREE_WIDTH = 280;
const MIN_TREE_WIDTH = 220;
const TREE_WIDTH_STORAGE_KEY = 'rv-tree-width';

function clampTreeWidth(value: number): number {
  const max = Math.max(MIN_TREE_WIDTH + 80, Math.round(window.innerWidth * 0.6));
  return Math.min(Math.max(Math.round(value), MIN_TREE_WIDTH), max);
}

function initialTreeWidth(): number {
  try {
    const stored = window.localStorage.getItem(TREE_WIDTH_STORAGE_KEY);
    if (stored) return clampTreeWidth(Number(stored));
  } catch {
    /* localStorage 不可用时使用默认宽度 */
  }
  return DEFAULT_TREE_WIDTH;
}

interface ModelExplorerProps {
  tree: RvmTreeNode;
  selectedNode: RvmTreeNode | null;
  attributeStats: RvmAttributeStats;
  hiddenKeys: Set<string>;
  onSelect: (node: RvmTreeNode) => void;
  onLocate: (node: RvmTreeNode) => void;
  onToggleVisible: (node: RvmTreeNode, key: string) => void;
  onResetVisibility: () => void;
  onClose: () => void;
  open: boolean;
}

export function ModelExplorer({
  tree,
  selectedNode,
  attributeStats,
  hiddenKeys,
  onSelect,
  onLocate,
  onToggleVisible,
  onResetVisibility,
  onClose,
  open,
}: ModelExplorerProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(() => new Set([TREE_ROOT_KEY]));
  const [query, setQuery] = useState('');
  const [width, setWidth] = useState(initialTreeWidth);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingScrollKey = useRef<string | null>(null);
  const resizeDrag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--rv-dock-left-width', `${width}px`);
    try {
      window.localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(width));
    } catch {
      /* localStorage 不可用时跳过持久化 */
    }
  }, [width]);

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeDrag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = drag.startWidth + event.clientX - drag.startX;
    if (Number.isFinite(next)) setWidth(clampTreeWidth(next));
  };
  const onResizeEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (resizeDrag.current?.pointerId !== event.pointerId) return;
    resizeDrag.current = null;
  };
  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setWidth((current) => clampTreeWidth(current - 16));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setWidth((current) => clampTreeWidth(current + 16));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setWidth(clampTreeWidth(DEFAULT_TREE_WIDTH));
    }
  };

  const toggleExpanded = (key: string, next: boolean): void => {
    setExpanded((current) => {
      const nextSet = new Set(current);
      if (next) nextSet.add(key);
      else nextSet.delete(key);
      return nextSet;
    });
  };

  const expandKeys = (keys: string[]): void => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const key of keys) next.add(key);
      return next.size === current.size ? current : next;
    });
  };

  const locateFromSearch = (match: TreeSearchMatch): void => {
    onSelect(match.node);
    expandKeys(match.keys);
    onLocate(match.node);
  };

  // 反向联动（三维点选）或外部状态变化时，展开祖先链并把选中行滚进可视区。
  // 展开产生的行要等下一次渲染才挂载，滚动因此放到提交后的独立 effect 里。
  useEffect(() => {
    if (!selectedNode) return;
    const path = findIndexPath(tree, selectedNode);
    if (!path) return;
    const keys = indexPathKeys(path);
    pendingScrollKey.current = keys[keys.length - 1];
    expandKeys(keys);
  }, [tree, selectedNode]);

  useEffect(() => {
    const key = pendingScrollKey.current;
    if (!key) return;
    const row = rowRefs.current.get(key);
    if (!row) return;
    pendingScrollKey.current = null;
    if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  });

  const geometryIndex = useMemo(() => buildGeometryIndex(tree), [tree]);
  const matches = useMemo(() => searchTree(tree, query), [tree, query]);

  return (
    <aside className={`rv-dock rv-dock--left${open ? ' rv-dock--open' : ''}`} aria-label="模型结构">
      <header className="rv-dock__header">
        <Boxes aria-hidden="true" size={17} strokeWidth={1.8} />
        <strong>模型结构</strong>
        <button className="rv-dock__close" type="button" aria-label="关闭模型结构" onClick={onClose}>
          <X aria-hidden="true" size={17} />
        </button>
      </header>
      <div className="rv-tree-search">
        <input
          type="search"
          value={query}
          placeholder="按名称查找节点"
          aria-label="按名称查找节点"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button type="button" aria-label="清除查找" onClick={() => setQuery('')}>
            <X aria-hidden="true" size={13} />
          </button>
        ) : null}
      </div>
      {query ? (
        <div className="rv-tree-search-results" aria-label="查找结果">
          {matches.length === 0 ? (
            <div className="rv-panel-state">没有匹配的节点</div>
          ) : (
            matches.map((match) => (
              <button
                key={searchResultKey(match)}
                type="button"
                title={rvmNodeDisplayPath(match.node)}
                onClick={() => locateFromSearch(match)}
              >
                <span>{match.node.name}</span>
                <small>{rvmNodeDisplayPath(match.node)}</small>
              </button>
            ))
          )}
          {matches.length >= SEARCH_RESULT_LIMIT ? (
            <div className="rv-panel-state">仅显示前 {SEARCH_RESULT_LIMIT} 条结果</div>
          ) : null}
        </div>
      ) : null}
      <div className="rv-attribute-summary">
        <span>
          {attributeStats.loaded
            ? `属性挂接 ${attributeStats.attached.toLocaleString()} · 未匹配 ${attributeStats.missed.toLocaleString()}`
            : '未加载外部属性'}
        </span>
        {hiddenKeys.size > 0 ? (
          <button type="button" aria-label="恢复全部显示" onClick={onResetVisibility}>
            恢复显示
          </button>
        ) : null}
      </div>
      <div className="rv-tree-scroll">
        <ul className="rv-tree" role="tree" aria-label="RVM 节点层级">
          <TreeItem
            node={tree}
            nodeKey={TREE_ROOT_KEY}
            parentHidden={false}
            hiddenKeys={hiddenKeys}
            geometryIndex={geometryIndex}
            selectedNode={selectedNode}
            expanded={expanded}
            rowRefs={rowRefs}
            onSelect={onSelect}
            onLocate={onLocate}
            onToggleExpanded={toggleExpanded}
            onToggleVisible={onToggleVisible}
          />
        </ul>
      </div>
      <div
        className="rv-dock__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整面板宽度"
        title="拖拽调整宽度 · 双击复位"
        tabIndex={0}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={() => setWidth(clampTreeWidth(DEFAULT_TREE_WIDTH))}
        onKeyDown={onResizeKeyDown}
      />
    </aside>
  );
}

interface TreeItemProps {
  node: RvmTreeNode;
  nodeKey: string;
  parentHidden: boolean;
  hiddenKeys: Set<string>;
  geometryIndex: WeakMap<RvmTreeNode, boolean>;
  selectedNode: RvmTreeNode | null;
  expanded: Set<string>;
  rowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onSelect: (node: RvmTreeNode) => void;
  onLocate: (node: RvmTreeNode) => void;
  onToggleExpanded: (key: string, next: boolean) => void;
  onToggleVisible: (node: RvmTreeNode, key: string) => void;
}

function TreeItem({
  node,
  nodeKey,
  parentHidden,
  hiddenKeys,
  geometryIndex,
  selectedNode,
  expanded,
  rowRefs,
  onSelect,
  onLocate,
  onToggleExpanded,
  onToggleVisible,
}: TreeItemProps): React.JSX.Element {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(nodeKey);
  const isSelected = selectedNode === node;
  const hidden = parentHidden || hiddenKeys.has(nodeKey);
  const hasGeometry = geometryIndex.get(node) === true;
  const selectTitle = hasGeometry
    ? rvmNodeDisplayPath(node)
    : `${rvmNodeDisplayPath(node)}（无三维实体，仅供组织归类）`;
  const toggleVisible = (): void => onToggleVisible(node, nodeKey);

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected}>
      <div
        ref={rowRef(rowRefs, nodeKey)}
        className={`rv-tree__row${isSelected ? ' rv-tree__row--selected' : ''}${hidden ? ' rv-tree__row--hidden' : ''}`}
      >
        {hasChildren ? (
          <button
            className="rv-tree__toggle"
            type="button"
            aria-label={`${isExpanded ? '收起' : '展开'} ${nodeDisplayName(node)}`}
            onClick={() => onToggleExpanded(nodeKey, !isExpanded)}
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
          title={selectTitle}
          onClick={() => {
            onSelect(node);
            onToggleExpanded(nodeKey, true);
          }}
          onDoubleClick={() => {
            onSelect(node);
            onToggleExpanded(nodeKey, true);
            if (hasGeometry) onLocate(node);
          }}
        >
          <span className={hasGeometry ? undefined : 'rv-tree__name--empty'}>
            {node.name || '(未命名节点)'}
          </span>
          {node.propertyCount > 0 ? <small>{node.propertyCount}</small> : null}
        </button>
        {/* 无三维实体的组织节点：定位/显隐都是无效操作，不显示工具 */}
        {hasGeometry ? (
          <span className="rv-tree__tools">
            <button
              type="button"
              aria-label={`${hidden ? '显示' : '隐藏'} ${nodeDisplayName(node)}`}
              title={hidden ? '显示子树' : '隐藏子树'}
              onClick={toggleVisible}
            >
              {hidden ? <EyeOff aria-hidden="true" size={14} /> : <Eye aria-hidden="true" size={14} />}
            </button>
            <button
              type="button"
              aria-label={`定位 ${nodeDisplayName(node)}`}
              title="定位到三维模型"
              onClick={() => {
                onSelect(node);
                onLocate(node);
              }}
            >
              <Crosshair aria-hidden="true" size={14} />
            </button>
          </span>
        ) : null}
      </div>
      {hasChildren && isExpanded ? (
        <ul role="group">
          {node.children.map((child, index) => (
            <TreeItem
              key={childKey(nodeKey, index)}
              node={child}
              nodeKey={childKey(nodeKey, index)}
              parentHidden={hidden}
              hiddenKeys={hiddenKeys}
              geometryIndex={geometryIndex}
              selectedNode={selectedNode}
              expanded={expanded}
              rowRefs={rowRefs}
              onSelect={onSelect}
              onLocate={onLocate}
              onToggleExpanded={onToggleExpanded}
              onToggleVisible={onToggleVisible}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function rowRef(
  rowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  key: string
): (element: HTMLDivElement | null) => void {
  return (element) => {
    if (element) rowRefs.current.set(key, element);
    else rowRefs.current.delete(key);
  };
}

function nodeDisplayName(node: RvmTreeNode): string {
  return node.name || '(未命名节点)';
}

interface TreeSearchMatch {
  node: RvmTreeNode;
  /** 从根到该节点的键链（含根键），点击结果时展开祖先链。 */
  keys: string[];
}

function searchTree(tree: RvmTreeNode, query: string): TreeSearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const results: TreeSearchMatch[] = [];
  const walk = (node: RvmTreeNode, keys: string[]): void => {
    if (results.length >= SEARCH_RESULT_LIMIT) return;
    if ((node.name || '').toLowerCase().includes(needle)) results.push({ node, keys });
    for (let index = 0; index < node.children.length; index += 1) {
      walk(node.children[index], [...keys, childKey(keys[keys.length - 1], index)]);
    }
  };
  walk(tree, [TREE_ROOT_KEY]);
  return results;
}

function searchResultKey(match: TreeSearchMatch): string {
  return `${match.keys.join('.')}-${match.node.propertyCount}`;
}
