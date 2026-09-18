import type { ViewerUiState } from '../hooks/useViewer.js';

const PHASE_TEXT: Record<Exclude<ViewerUiState['phase'], 'loaded'>, string> = {
  idle: '就绪',
  loading: '正在加载数据…',
  parsing: '正在解析模型…',
  error: '加载出错',
};

export function StatusBar({ ui }: { ui: ViewerUiState }): React.JSX.Element {
  const text =
    ui.phase === 'loaded'
      ? `模型已加载（顶点 ${ui.vertices.toLocaleString()} · 三角面 ${ui.triangles.toLocaleString()}）`
      : PHASE_TEXT[ui.phase];

  return (
    <header className={`rv-status rv-status--${ui.phase}`}>
      <div className="rv-status__brand">
        <span>RVM</span>
        <strong>Viewer</strong>
      </div>
      <div className="rv-status__state" aria-live="polite">
        {text}
      </div>
    </header>
  );
}
