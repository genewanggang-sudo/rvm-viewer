import { ListTree, X } from 'lucide-react';
import type { PropertyPhase } from '../hooks/useViewer.js';
import type { RvmProperty, RvmTreeNode } from '../viewer/rvmSdk.js';

interface PropertiesPanelProps {
  node: RvmTreeNode | null;
  properties: RvmProperty[];
  phase: PropertyPhase;
  error: string | null;
  onClose: () => void;
  open: boolean;
}

export function PropertiesPanel({
  node,
  properties,
  phase,
  error,
  onClose,
  open,
}: PropertiesPanelProps): React.JSX.Element {
  return (
    <aside className={`rv-dock rv-dock--right${open ? ' rv-dock--open' : ''}`} aria-label="节点属性">
      <header className="rv-dock__header">
        <ListTree aria-hidden="true" size={17} strokeWidth={1.8} />
        <strong>属性</strong>
        <button className="rv-dock__close" type="button" aria-label="关闭节点属性" onClick={onClose}>
          <X aria-hidden="true" size={17} />
        </button>
      </header>
      {node ? (
        <div className="rv-property-node">
          <strong title={node.name}>{node.name || '(未命名节点)'}</strong>
          <span title={node.path}>{node.path}</span>
        </div>
      ) : null}
      <div className="rv-properties-scroll">
        {phase === 'loading' ? <div className="rv-panel-state">正在读取属性…</div> : null}
        {phase === 'error' ? <div className="rv-panel-state rv-panel-state--error">{error}</div> : null}
        {phase === 'loaded' && properties.length === 0 ? (
          <div className="rv-panel-state">此节点没有属性</div>
        ) : null}
        {phase === 'loaded' && properties.length > 0 ? (
          <dl className="rv-properties">
            {properties.map((property, index) => (
              <div key={`${property.name}-${index}`}>
                <dt>{property.name}</dt>
                <dd>{property.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </aside>
  );
}
