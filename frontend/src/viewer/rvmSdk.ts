import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type * as THREE from 'three';

const WORKER_URL = `${import.meta.env.BASE_URL}rvmsdk/rvm-worker.js`;

interface RvmOpenResult {
  handle: string | number;
  sourceFile: string;
  sourceFormat?: string;
  nodeCount: number;
  entityCount: number;
  attributeNodeCount: number;
}

interface RvmTreeResult {
  root: RvmTreeNode;
}

interface RvmPropertiesResult {
  properties: RvmProperty[];
}

interface RvmAttachResult {
  attached: number;
  missed: number;
}

interface RvmRpcClient {
  start(): RvmRpcClient;
  ready(): Promise<string>;
  call<T>(operation: string, payload?: Record<string, unknown>, transfer?: ArrayBuffer[]): Promise<T>;
}

declare global {
  interface Window {
    RvmRpc?: new (options: { workerUrl: string }) => RvmRpcClient;
  }
}

let rpcPromise: Promise<RvmRpcClient> | null = null;

export interface RvmMeta {
  sourceFile: string;
  sourceFormat: string;
  nodeCount: number;
  entityCount: number;
  attributeNodeCount: number;
}

export interface RvmTreeNode {
  name: string;
  path: string;
  segments: string[];
  visible: boolean;
  excluded: boolean;
  entityCount: number;
  propertyCount: number;
  children: RvmTreeNode[];
}

export interface RvmProperty {
  name: string;
  value: string;
}

export interface RvmAttributeStats {
  loaded: boolean;
  attached: number;
  missed: number;
}

export interface RvmModelSession {
  object: THREE.Object3D;
  meta: RvmMeta;
  tree: RvmTreeNode;
  attributeStats: RvmAttributeStats;
  getProperties: (segments: string[]) => Promise<RvmProperty[]>;
  close: () => Promise<void>;
}

export async function getRvmRpc(): Promise<RvmRpcClient> {
  if (!rpcPromise) {
    rpcPromise = createRvmRpc();
    void rpcPromise.catch(() => {
      rpcPromise = null;
    });
  }
  return rpcPromise;
}

export async function importRvmModel(
  bytes: ArrayBuffer,
  name: string,
  options: {
    attrs?: ArrayBuffer;
    displayName?: string;
    onProgress?: (message: string) => void;
  } = {}
): Promise<RvmModelSession> {
  const rpc = await getRvmRpc();
  const parserName = ensureRvmFileName(name);

  options.onProgress?.('正在解析 RVM 场景…');
  const info = await rpc.call<RvmOpenResult>('open', { name: parserName, bytes }, [bytes]);
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await rpc.call<void>('close', { handle: info.handle }).catch(() => undefined);
  };

  try {
    const attributeStats = options.attrs
      ? {
          loaded: true,
          ...(await rpc.call<RvmAttachResult>(
            'attachAttributes',
            { handle: info.handle, bytes: options.attrs },
            [options.attrs]
          )),
        }
      : { loaded: false, attached: 0, missed: 0 };

    options.onProgress?.('正在生成三维预览…');
    const [glb, tree] = await Promise.all([
      rpc.call<Uint8Array>('preview', { handle: info.handle }),
      rpc.call<RvmTreeResult>('tree', { handle: info.handle }),
    ]);
    const glbCopy = new Uint8Array(glb.byteLength);
    glbCopy.set(glb);
    const gltf = await new GLTFLoader().parseAsync(glbCopy.buffer, '');

    return {
      object: gltf.scene,
      tree: tree.root,
      attributeStats,
      meta: {
        sourceFile: options.displayName?.trim() || info.sourceFile,
        sourceFormat: String(info.sourceFormat ?? '').toUpperCase(),
        nodeCount: info.nodeCount,
        entityCount: info.entityCount,
        attributeNodeCount: attributeStats.loaded ? attributeStats.attached : info.attributeNodeCount,
      },
      getProperties: async (segments) => {
        if (closed) throw new Error('RVM 模型会话已关闭');
        const result = await rpc.call<RvmPropertiesResult>('getProperties', {
          handle: info.handle,
          segments,
        });
        return result.properties;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function ensureRvmFileName(name: string): string {
  const trimmed = name.trim();
  if (/\.rvm$/i.test(trimmed)) return trimmed;
  return `${trimmed || 'model'}.rvm`;
}

async function createRvmRpc(): Promise<RvmRpcClient> {
  if (!window.RvmRpc) throw new Error('RvmRpc 未加载：index.html 需先引入 /rvmsdk/rvm-rpc.js');
  const rpc = new window.RvmRpc({ workerUrl: WORKER_URL });
  rpc.start();
  await rpc.ready();
  return rpc;
}
