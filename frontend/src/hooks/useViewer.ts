import { useCallback, useEffect, useRef, useState } from 'react';
import { initDataChannels } from '../channels/dataChannels.js';
import { runtimeConfig } from '../config.js';
import {
  CHANNEL,
  type ChannelStatus,
  type DataChannel,
  type GeometryData,
  type RenderStats,
} from '../protocol.js';
import { parseLocalModel } from '../viewer/localModel.js';
import { importRvmModel } from '../viewer/rvmSdk.js';
import { ViewerEngine } from '../viewer/ViewerEngine.js';

export type ViewerPhase = 'idle' | 'loading' | 'waiting' | 'parsing' | 'loaded' | 'error';

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
  loadLocalFiles: (model: File, attributes?: File) => Promise<void>;
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

  const renderGeometry = useCallback((engine: ViewerEngine, data: GeometryData): RenderStats | null => {
    const stats = engine.setData(data);
    if (!stats) {
      setUi((state) => ({ ...state, phase: 'error', error: '几何数据无效（顶点/索引校验未通过）' }));
      return null;
    }

    setUi((state) => ({
      ...state,
      phase: 'loaded',
      name: data.name || state.name,
      format: data.format || '-',
      vertices: stats.vertices,
      triangles: stats.triangles,
      error: null,
    }));
    return stats;
  }, []);

  const renderRvm = useCallback(
    async (
      engine: ViewerEngine,
      bytes: ArrayBuffer,
      name: string,
      attributes?: ArrayBuffer
    ): Promise<boolean> => {
      try {
        const { object, meta } = await importRvmModel(bytes, name, {
          attrs: attributes,
          onProgress: (message) => setUi((state) => ({ ...state, phase: 'parsing', detail: message })),
        });
        if (engineRef.current !== engine) return false;

        const stats = engine.setObject3D(object);
        setUi((state) => ({
          ...state,
          phase: 'loaded',
          name: meta.sourceFile,
          format: meta.sourceFormat,
          vertices: stats.vertices,
          triangles: stats.triangles,
          detail: `节点 ${meta.nodeCount.toLocaleString()} · 实体 ${meta.entityCount.toLocaleString()} · 属性 ${meta.attributeNodeCount.toLocaleString()}`,
          error: null,
        }));
        return true;
      } catch (error) {
        if (engineRef.current === engine) {
          setUi((state) => ({ ...state, phase: 'error', error: `RVM 解析失败：${errorMessage(error)}` }));
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
      onGeometry: (data) => renderGeometry(engine, data),
      onFileBuffer: ({ bytes, attrs, name }) => renderRvm(engine, bytes, name ?? 'model.rvm', attrs),
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
  }, [renderGeometry, renderRvm]);

  const loadLocalFiles = useCallback(
    async (model: File, attributes?: File): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      setUi((state) => ({
        ...state,
        source: CHANNEL.LOCAL,
        phase: 'loading',
        detail: null,
        error: null,
      }));

      try {
        const parsed = await parseLocalModel(model, maxLocalFileBytes);
        if (engineRef.current !== engine) return;

        if (parsed.kind === 'geometry') {
          renderGeometry(engine, parsed.data);
          return;
        }

        const attributeBytes = attributes ? await attributes.arrayBuffer() : undefined;
        if (engineRef.current !== engine) return;
        await renderRvm(engine, parsed.bytes, parsed.name, attributeBytes);
      } catch (error) {
        if (engineRef.current === engine) {
          setUi((state) => ({ ...state, phase: 'error', error: `本地文件加载失败：${errorMessage(error)}` }));
        }
      }
    },
    [maxLocalFileBytes, renderGeometry, renderRvm]
  );

  return { canvasRef, ui, loadLocalFiles };
}

function mapPhase(status: ChannelStatus): ViewerPhase {
  switch (status) {
    case 'loading':
    case 'parsing':
      return status;
    case 'waiting':
      return 'waiting';
    case 'loaded':
      return 'loaded';
    case 'empty':
      return 'idle';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
