import { ErrorOverlay } from './components/ErrorOverlay.js';
import { CameraToolbar } from './components/CameraToolbar.js';
import { Hud } from './components/Hud.js';
import { LocalFileLoader } from './components/LocalFileLoader.js';
import { StatusBar } from './components/StatusBar.js';
import { runtimeConfig } from './config.js';
import { useViewer } from './hooks/useViewer.js';
import { URL_PARAMS } from './protocol.js';

export default function App(): React.JSX.Element {
  const embed = new URLSearchParams(window.location.search).get(URL_PARAMS.EMBED) === '1';
  const { canvasRef, ui, loadLocalRvm, loadTestRvm, frameCamera, resetCamera } = useViewer(
    runtimeConfig.maxLocalFileBytes
  );

  return (
    <div className="rv-app">
      <canvas ref={canvasRef} className="rv-canvas" aria-label="三维模型视图" />
      {!embed ? <StatusBar ui={ui} /> : null}
      {!embed && ui.phase === 'loaded' ? <Hud ui={ui} /> : null}
      {!embed && ui.phase === 'idle' ? (
        <div className="rv-empty-state" aria-label="等待加载模型">
          <span>RVM</span>
          <strong>等待模型</strong>
        </div>
      ) : null}
      {!embed ? (
        <LocalFileLoader
          maxFileBytes={runtimeConfig.maxLocalFileBytes}
          onLoad={loadLocalRvm}
          onLoadTest={loadTestRvm}
          showTestModel={runtimeConfig.testModelEnabled}
        />
      ) : null}
      {!embed ? (
        <CameraToolbar disabled={ui.phase !== 'loaded'} onFrame={frameCamera} onReset={resetCamera} />
      ) : null}
      {ui.phase === 'error' && ui.error ? <ErrorOverlay message={ui.error} /> : null}
    </div>
  );
}
