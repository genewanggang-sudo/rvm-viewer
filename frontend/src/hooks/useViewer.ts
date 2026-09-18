import { useCallback, useEffect, useRef, useState } from 'react';
import { initDataChannels } from '../channels/dataChannels.js';
import { runtimeConfig } from '../config.js';
import {
  CHANNEL,
  MSG,
  PROTOCOL_VERSION,
  type ChannelStatus,
  type DataChannel,
  type RenderStats,
} from '../protocol.js';
import { readLocalRvm } from '../viewer/localModel.js';
import { importRvmModel } from '../viewer/rvmSdk.js';
import { ViewerEngine } from '../viewer/ViewerEngine.js';

const TEST_RVM_URL = '/__rvm-testdata/WD1-PSUP.RVM';
const TEST_RVM_NAME = 'WD1-PSUP.RVM';

export type ViewerPhase = 'idle' | 'loading' | 'parsing' | 'loaded' | 'error';

export interface ViewerUiState {
  phase: ViewerPhase;
  source: DataChannel | '-';
  name: string;
  format: string;
  vertices: number;
  triangles: number;
  detail: string | null;
  error: string | null;
}

export interface ViewerController {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  ui: ViewerUiState;
  loadLocalRvm: (model: File) => Promise<void>;
  loadTestRvm: () => Promise<void>;
  frameCamera: () => void;
  resetCamera: () => void;
}

const INITIAL_UI: ViewerUiState = {
  phase: 'idle',
  source: '-',
  name: runtimeConfig.title,
  format: '-',
  vertices: 0,
  triangles: 0,
  detail: null,
  error: null,
};

export function useViewer(maxLocalFileBytes: number): ViewerController {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ViewerEngine | null>(null);
  const [ui, setUi] = useState<ViewerUiState>(INITIAL_UI);

  const renderRvm = useCallback(
    async (engine: ViewerEngine, bytes: ArrayBuffer, name: string, source: DataChannel): Promise<boolean> => {
      try {
        const { object, meta } = await importRvmModel(bytes, name, {
          onProgress: (message) =>
            setUi((state) => ({ ...state, source, phase: 'parsing', detail: message })),
        });
        if (engineRef.current !== engine) return false;

        const stats = engine.setObject3D(object);
        setUi({
          phase: 'loaded',
          source,
          name: meta.sourceFile,
          format: meta.sourceFormat,
          vertices: stats.vertices,
          triangles: stats.triangles,
          detail: `节点 ${meta.nodeCount.toLocaleString()} · 实体 ${meta.entityCount.toLocaleString()} · 属性 ${meta.attributeNodeCount.toLocaleString()}`,
          error: null,
        });
        announceRendered(meta.sourceFile, stats);
        return true;
      } catch (error) {
        if (engineRef.current === engine) {
          setUi((state) => ({
            ...state,
            source,
            phase: 'error',
            error: `RVM 解析失败：${errorMessage(error)}`,
          }));
        }
        return false;
      }
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const engine = new ViewerEngine(canvas);
    engineRef.current = engine;
    const cleanup = initDataChannels({
      onRvmFile: ({ bytes, name }) => renderRvm(engine, bytes, name, CHANNEL.FILE),
      onStatus: (source, status) => {
        setUi((state) => ({ ...state, source, phase: mapPhase(status), detail: null, error: null }));
      },
      onError: (message) => setUi((state) => ({ ...state, phase: 'error', error: message })),
    });

    return () => {
      cleanup();
      if (engineRef.current === engine) engineRef.current = null;
      engine.dispose();
    };
  }, [renderRvm]);

  const loadLocalRvm = useCallback(
    async (model: File): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      setUi((state) => ({ ...state, source: CHANNEL.LOCAL, phase: 'loading', detail: null, error: null }));
      try {
        const rvm = await readLocalRvm(model, maxLocalFileBytes);
        if (engineRef.current !== engine) return;
        await renderRvm(engine, rvm.bytes, rvm.name, CHANNEL.LOCAL);
      } catch (error) {
        if (engineRef.current === engine) {
          setUi((state) => ({
            ...state,
            source: CHANNEL.LOCAL,
            phase: 'error',
            error: `RVM 文件加载失败：${errorMessage(error)}`,
          }));
        }
      }
    },
    [maxLocalFileBytes, renderRvm]
  );

  const loadTestRvm = useCallback(async (): Promise<void> => {
    const engine = engineRef.current;
    if (!engine) return;

    setUi((state) => ({ ...state, source: CHANNEL.TEST, phase: 'loading', detail: null, error: null }));
    try {
      const response = await fetch(TEST_RVM_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await renderRvm(engine, await response.arrayBuffer(), TEST_RVM_NAME, CHANNEL.TEST);
    } catch (error) {
      if (engineRef.current === engine) {
        setUi((state) => ({
          ...state,
          source: CHANNEL.TEST,
          phase: 'error',
          error: `测试 RVM 加载失败：${errorMessage(error)}`,
        }));
      }
    }
  }, [renderRvm]);

  const frameCamera = useCallback(() => engineRef.current?.frameModel(), []);
  const resetCamera = useCallback(() => engineRef.current?.resetCamera(), []);

  return { canvasRef, ui, loadLocalRvm, loadTestRvm, frameCamera, resetCamera };
}

function mapPhase(status: ChannelStatus): ViewerPhase {
  switch (status) {
    case 'loading':
    case 'parsing':
      return status;
    case 'empty':
      return 'idle';
  }
}

function announceRendered(name: string, stats: RenderStats): void {
  if (window.parent === window) return;
  window.parent.postMessage({ v: PROTOCOL_VERSION, type: MSG.RENDERED, name, ...stats }, '*');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
