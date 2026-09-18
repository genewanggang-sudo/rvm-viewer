import type { ViewerUiState } from '../hooks/useViewer.js';

const PHASE_TEXT: Partial<Record<ViewerUiState['phase'], string>> = {
  loading: '加载中…',
  parsing: '解析中…',
  error: '出错',
};

export function Hud({ ui }: { ui: ViewerUiState }): React.JSX.Element {
  const phaseText = PHASE_TEXT[ui.phase];
  return (
    <aside className="rv-hud" aria-label="模型信息" aria-live="polite">
      <div className="rv-hud__eyebrow">当前模型</div>
      <b className="rv-hud__name" title={ui.name}>
        {ui.name}
      </b>
      <dl className="rv-hud__meta">
        <div>
          <dt>格式</dt>
          <dd>{ui.format}</dd>
        </div>
        <div>
          <dt>顶点</dt>
          <dd>{ui.vertices.toLocaleString()}</dd>
        </div>
        <div>
          <dt>三角面</dt>
          <dd>{ui.triangles.toLocaleString()}</dd>
        </div>
      </dl>
      {ui.detail ? <div className="rv-hud__detail">{ui.detail}</div> : null}
      <div className={`rv-hud__source rv-hud__source--${ui.phase}`}>
        {ui.source}
        {phaseText ? ` · ${phaseText}` : ''}
      </div>
    </aside>
  );
}
