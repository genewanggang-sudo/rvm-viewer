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
import {
  importRvmModel,
  type RvmAttributeStats,
  type RvmModelSession,
  type RvmProperty,
  type RvmTreeNode,
} from '../viewer/rvmSdk.js';
import { ViewerEngine } from '../viewer/ViewerEngine.js';
import { childKey, TREE_ROOT_KEY, findIndexPath } from '../viewer/treeUtils.js';

const TEST_RVM_URL = '/__rvm-testdata/WD1-PSUP.RVM';
const TEST_ATTRIBUTES_URL = '/__rvm-testdata/WD1-PSUP.txt';
const TEST_RVM_NAME = 'WD1-PSUP.RVM';

export type ViewerPhase = 'idle' | 'loading' | 'parsing' | 'loaded' | 'error';
export type PropertyPhase = 'idle' | 'loading' | 'loaded' | 'error';

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
  tree: RvmTreeNode | null;
  selectedNode: RvmTreeNode | null;
  properties: RvmProperty[];
  propertyPhase: PropertyPhase;
  propertyError: string | null;
  attributeStats: RvmAttributeStats | null;
  /** 本地隐藏子树（树索引键），仅 three.js 显隐，不回写 wasm。 */
  hiddenKeys: Set<string>;
  loadLocalRvm: (model: File, attributes?: File) => Promise<void>;
  loadTestRvm: () => Promise<void>;
  selectNode: (node: RvmTreeNode) => Promise<void>;
  clearSelection: () => void;
  locateNode: (node: RvmTreeNode) => void;
  locateSelected: () => void;
  toggleNodeVisible: (node: RvmTreeNode, key: string) => void;
  isolateNode: (node: RvmTreeNode) => void;
  resetVisibility: () => void;
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
  const sessionRef = useRef<RvmModelSession | null>(null);
  const loadRequestRef = useRef(0);
  const propertyRequestRef = useRef(0);
  const [ui, setUi] = useState<ViewerUiState>(INITIAL_UI);
  const [tree, setTree] = useState<RvmTreeNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<RvmTreeNode | null>(null);
  const [properties, setProperties] = useState<RvmProperty[]>([]);
  const [propertyPhase, setPropertyPhase] = useState<PropertyPhase>('idle');
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [attributeStats, setAttributeStats] = useState<RvmAttributeStats | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());

  /** 根节点代表整个模型，整棵高亮只会变成满屏橙色，按约定跳过。 */
  const applySelectionHighlight = useCallback((node: RvmTreeNode): void => {
    const engine = engineRef.current;
    const session = sessionRef.current;
    if (!engine || !session) return;
    if (node === session.tree) {
      engine.setHighlighted(null);
      return;
    }
    engine.setHighlighted(session.resolveObject(node));
  }, []);

  const readProperties = useCallback(async (session: RvmModelSession, node: RvmTreeNode): Promise<void> => {
    const request = ++propertyRequestRef.current;
    setSelectedNode(node);
    setProperties([]);
    setPropertyPhase('loading');
    setPropertyError(null);
    try {
      const result = await session.getProperties(node.segments);
      if (sessionRef.current !== session || propertyRequestRef.current !== request) return;
      setProperties(result);
      setPropertyPhase('loaded');
    } catch (error) {
      if (sessionRef.current !== session || propertyRequestRef.current !== request) return;
      setPropertyPhase('error');
      setPropertyError(`节点属性读取失败：${errorMessage(error)}`);
    }
  }, []);

  const selectNode = useCallback(
    async (node: RvmTreeNode): Promise<void> => {
      applySelectionHighlight(node);
      const session = sessionRef.current;
      if (!session) return;
      await readProperties(session, node);
    },
    [applySelectionHighlight, readProperties]
  );

  const clearSelection = useCallback((): void => {
    propertyRequestRef.current += 1;
    setSelectedNode(null);
    setProperties([]);
    setPropertyPhase('idle');
    setPropertyError(null);
    engineRef.current?.setHighlighted(null);
  }, []);

  const locateNode = useCallback((node: RvmTreeNode): void => {
    const session = sessionRef.current;
    const engine = engineRef.current;
    if (!session || !engine) return;
    if (node === session.tree) {
      engine.frameModel();
      return;
    }
    const object = session.resolveObject(node);
    if (object) engine.frameObject(object);
  }, []);

  /** 相机工具条的定位按钮：未选中节点时是安全的空操作。 */
  const locateSelected = useCallback((): void => {
    if (selectedNode) locateNode(selectedNode);
  }, [selectedNode, locateNode]);

  const toggleNodeVisible = useCallback((node: RvmTreeNode, key: string): void => {
    const session = sessionRef.current;
    const engine = engineRef.current;
    if (!session || !engine) return;
    const object = session.resolveObject(node);
    if (!object) return;
    const nextVisible = !object.visible;
    engine.setSubtreeVisible(object, nextVisible);
    setHiddenKeys((current) => {
      const next = new Set(current);
      if (nextVisible) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** 隔离：只保留包含该节点的一级分支，其余隐藏并定位到目标。 */
  const isolateNode = useCallback((node: RvmTreeNode): void => {
    const session = sessionRef.current;
    const engine = engineRef.current;
    if (!session || !engine) return;
    if (node === session.tree) {
      engine.frameModel();
      return;
    }
    const path = findIndexPath(session.tree, node);
    if (!path) return;
    const hidden = new Set<string>();
    session.tree.children.forEach((branch, index) => {
      const object = session.resolveObject(branch);
      if (!object) return;
      const keep = index === path[0];
      engine.setSubtreeVisible(object, keep);
      if (!keep) hidden.add(childKey(TREE_ROOT_KEY, index));
    });
    setHiddenKeys(hidden);
    const object = session.resolveObject(node);
    if (object) engine.frameObject(object);
  }, []);

  const resetVisibility = useCallback((): void => {
    const session = sessionRef.current;
    const engine = engineRef.current;
    if (!session || !engine) return;
    for (const branch of session.tree.children) {
      const object = session.resolveObject(branch);
      if (object) engine.setSubtreeVisible(object, true);
    }
    setHiddenKeys(new Set());
  }, []);

  const renderRvm = useCallback(
    async (
      engine: ViewerEngine,
      bytes: ArrayBuffer,
      name: string,
      source: DataChannel,
      attrs?: ArrayBuffer,
      displayName?: string
    ): Promise<boolean> => {
      const request = ++loadRequestRef.current;
      let session: RvmModelSession | null = null;
      try {
        session = await importRvmModel(bytes, name, {
          attrs,
          displayName,
          onProgress: (message) =>
            setUi((state) => ({ ...state, source, phase: 'parsing', detail: message })),
        });
        if (engineRef.current !== engine || loadRequestRef.current !== request) {
          await session.close();
          return false;
        }

        const stats = engine.setObject3D(session.object);
        const previous = sessionRef.current;
        sessionRef.current = session;
        setTree(session.tree);
        setAttributeStats(session.attributeStats);
        setHiddenKeys(new Set());
        setUi({
          phase: 'loaded',
          source,
          name: session.meta.sourceFile,
          format: session.meta.sourceFormat,
          vertices: stats.vertices,
          triangles: stats.triangles,
          detail: `节点 ${session.meta.nodeCount.toLocaleString()} · 实体 ${session.meta.entityCount.toLocaleString()} · 属性 ${session.meta.attributeNodeCount.toLocaleString()}`,
          error: null,
        });
        void previous?.close();
        void readProperties(session, session.tree);
        announceRendered(session.meta.sourceFile, stats);
        return true;
      } catch (error) {
        if (session && sessionRef.current !== session) await session.close();
        if (engineRef.current === engine && loadRequestRef.current === request) {
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
    [readProperties]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const engine = new ViewerEngine(canvas);
    engineRef.current = engine;
    engine.setSelectionHandler((object) => {
      const session = sessionRef.current;
      if (!session) return;
      if (!object) {
        clearSelection();
        return;
      }
      const node = session.resolveNode(object);
      if (node) void selectNode(node);
    });
    const cleanup = initDataChannels({
      onRvmFile: ({ bytes, name, displayName, attrs }) =>
        renderRvm(engine, bytes, name, CHANNEL.FILE, attrs, displayName),
      onStatus: (source, status) => {
        setUi((state) => ({ ...state, source, phase: mapPhase(status), detail: null, error: null }));
      },
      onError: (message) => setUi((state) => ({ ...state, phase: 'error', error: message })),
    });

    return () => {
      cleanup();
      loadRequestRef.current += 1;
      propertyRequestRef.current += 1;
      if (engineRef.current === engine) engineRef.current = null;
      const session = sessionRef.current;
      sessionRef.current = null;
      void session?.close();
      engine.dispose();
    };
  }, [renderRvm, selectNode, clearSelection]);

  const loadLocalRvm = useCallback(
    async (model: File, attributes?: File): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      setUi((state) => ({ ...state, source: CHANNEL.LOCAL, phase: 'loading', detail: null, error: null }));
      try {
        const rvm = await readLocalRvm(model, maxLocalFileBytes, attributes);
        if (engineRef.current !== engine) return;
        await renderRvm(engine, rvm.bytes, rvm.name, CHANNEL.LOCAL, rvm.attrs);
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
      const [modelResponse, attributesResponse] = await Promise.all([
        fetch(TEST_RVM_URL),
        fetch(TEST_ATTRIBUTES_URL),
      ]);
      if (!modelResponse.ok) throw new Error(`RVM HTTP ${modelResponse.status}`);
      if (!attributesResponse.ok) throw new Error(`属性 HTTP ${attributesResponse.status}`);
      const [bytes, attrs] = await Promise.all([
        modelResponse.arrayBuffer(),
        attributesResponse.arrayBuffer(),
      ]);
      await renderRvm(engine, bytes, TEST_RVM_NAME, CHANNEL.TEST, attrs);
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

  return {
    canvasRef,
    ui,
    tree,
    selectedNode,
    properties,
    propertyPhase,
    propertyError,
    attributeStats,
    hiddenKeys,
    loadLocalRvm,
    loadTestRvm,
    selectNode,
    clearSelection,
    locateNode,
    locateSelected,
    toggleNodeVisible,
    isolateNode,
    resetVisibility,
    frameCamera,
    resetCamera,
  };
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
