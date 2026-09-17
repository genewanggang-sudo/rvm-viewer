import type { ViewerUiState } from '../hooks/useViewer.js';

const PHASE_TEXT: Partial<Record<ViewerUiState['phase'], string>> = {
  loading: '加载中…',
  waiting: '等待数据…',
  parsing: '解析中…',
  error: '出错',
};

export function Hud({ ui }: { ui: ViewerUiState }): React.JSX.Element {
  const phaseText = PHASE_TEXT[ui.phase];
  return (
    <aside className="rv-hud" aria-live="polite">
      <b className="rv-hud__name">{ui.name}</b>
      <div className="rv-hud__meta">
        格式 {ui.format} · 顶点 {ui.vertices.toLocaleString()} · 三角面 {ui.triangles.toLocaleString()}
        {ui.detail ? (
          <>
            <br />
            {ui.detail}
          </>
        ) : null}
        <br />
        拖拽旋转 · 滚轮缩放
      </div>
      <div className={`rv-hud__source rv-hud__source--${ui.phase}`}>
        {ui.source}
        {phaseText ? ` · ${phaseText}` : ''}
      </div>
    </aside>
  );
}
