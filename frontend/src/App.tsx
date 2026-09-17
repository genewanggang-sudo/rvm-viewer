import { ErrorOverlay } from './components/ErrorOverlay.js';
import { Hud } from './components/Hud.js';
import { LocalFileLoader } from './components/LocalFileLoader.js';
import { StatusBar } from './components/StatusBar.js';
import { runtimeConfig } from './config.js';
import { useViewer } from './hooks/useViewer.js';
import { URL_PARAMS } from './protocol.js';

export default function App(): React.JSX.Element {
  const embed = new URLSearchParams(window.location.search).get(URL_PARAMS.EMBED) === '1';
  const { canvasRef, ui, loadLocalFiles } = useViewer(runtimeConfig.maxLocalFileBytes);

  return (
    <div className="rv-app">
      <canvas ref={canvasRef} className="rv-canvas" aria-label="三维模型视图" />
      {!embed ? <StatusBar ui={ui} /> : null}
      {!embed ? <Hud ui={ui} /> : null}
      {!embed && runtimeConfig.enableLocalUpload ? (
        <LocalFileLoader maxFileBytes={runtimeConfig.maxLocalFileBytes} onLoad={loadLocalFiles} />
      ) : null}
      {ui.phase === 'error' && ui.error ? <ErrorOverlay message={ui.error} /> : null}
    </div>
  );
}
