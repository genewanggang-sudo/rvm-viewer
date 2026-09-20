import { useState } from 'react';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { ErrorOverlay } from './components/ErrorOverlay.js';
import { CameraToolbar } from './components/CameraToolbar.js';
import { LocalFileLoader } from './components/LocalFileLoader.js';
import { ModelExplorer } from './components/ModelExplorer.js';
import { PropertiesPanel } from './components/PropertiesPanel.js';
import { runtimeConfig } from './config.js';
import { useViewer } from './hooks/useViewer.js';
import { URL_PARAMS } from './protocol.js';

export default function App(): React.JSX.Element {
  const [mobilePanel, setMobilePanel] = useState<'tree' | 'properties' | null>(null);
  const searchParams = new URLSearchParams(window.location.search);
  const embed = searchParams.get(URL_PARAMS.EMBED) === '1';
  const showDevUi = runtimeConfig.devUiEnabled && !embed;
  const viewer = useViewer(runtimeConfig.maxLocalFileBytes);
  const { canvasRef, ui, loadLocalRvm, loadTestRvm, frameCamera, resetCamera } = viewer;
  const hasWorkspace = ui.phase === 'loaded' && viewer.tree !== null && viewer.attributeStats !== null;
  return (
    <div className={`rv-app${hasWorkspace ? ' rv-app--workspace' : ''}`}>
      <canvas ref={canvasRef} className="rv-canvas" aria-label="三维模型视图" />
      {showDevUi && !hasWorkspace ? (
        <LocalFileLoader
          maxFileBytes={runtimeConfig.maxLocalFileBytes}
          onLoad={loadLocalRvm}
          onLoadTest={loadTestRvm}
          showTestModel
        />
      ) : null}
      <CameraToolbar
        disabled={ui.phase !== 'loaded'}
        onFrame={frameCamera}
        onReset={resetCamera}
        onLocateSelected={viewer.locateSelected}
      />
      {hasWorkspace && viewer.tree && viewer.attributeStats ? (
        <>
          <ModelExplorer
            tree={viewer.tree}
            selectedNode={viewer.selectedNode}
            attributeStats={viewer.attributeStats}
            hiddenKeys={viewer.hiddenKeys}
            onSelect={(node) => void viewer.selectNode(node)}
            onLocate={viewer.locateNode}
            onToggleVisible={viewer.toggleNodeVisible}
            onIsolate={viewer.isolateNode}
            onResetVisibility={viewer.resetVisibility}
            onClose={() => setMobilePanel(null)}
            open={mobilePanel === 'tree'}
          />
          <PropertiesPanel
            node={viewer.selectedNode}
            properties={viewer.properties}
            phase={viewer.propertyPhase}
            error={viewer.propertyError}
            onClose={() => setMobilePanel(null)}
            open={mobilePanel === 'properties'}
          />
          <nav className="rv-panel-tools" aria-label="模型信息面板">
            <button
              type="button"
              title="模型结构"
              aria-label="打开模型结构"
              onClick={() => setMobilePanel('tree')}
            >
              <PanelLeftOpen aria-hidden="true" size={18} />
            </button>
            <button
              type="button"
              title="节点属性"
              aria-label="打开节点属性"
              onClick={() => setMobilePanel('properties')}
            >
              <PanelRightOpen aria-hidden="true" size={18} />
            </button>
          </nav>
        </>
      ) : null}
      {ui.phase === 'error' && ui.error ? <ErrorOverlay message={ui.error} /> : null}
    </div>
  );
}
