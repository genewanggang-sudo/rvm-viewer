import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type * as THREE from 'three';

const WORKER_URL = `${import.meta.env.BASE_URL}rvmsdk/rvm-worker.js`;

interface RvmOpenResult {
  handle: string;
  sourceFile: string;
  sourceFormat?: string;
  nodeCount: number;
  entityCount: number;
  attributeNodeCount: number;
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
  options: { attrs?: ArrayBuffer; onProgress?: (message: string) => void } = {}
): Promise<{ object: THREE.Object3D; meta: RvmMeta }> {
  const rpc = await getRvmRpc();
  const transfer = options.attrs ? [bytes, options.attrs] : [bytes];

  options.onProgress?.('正在解析 RVM 场景…');
  const info = await rpc.call<RvmOpenResult>('open', { name, bytes, attrs: options.attrs }, transfer);

  try {
    options.onProgress?.('正在生成三维预览…');
    const glb = await rpc.call<Uint8Array>('preview', { handle: info.handle });
    const glbCopy = new Uint8Array(glb.byteLength);
    glbCopy.set(glb);
    const gltf = await new GLTFLoader().parseAsync(glbCopy.buffer, '');

    return {
      object: gltf.scene,
      meta: {
        sourceFile: info.sourceFile,
        sourceFormat: String(info.sourceFormat ?? '').toUpperCase(),
        nodeCount: info.nodeCount,
        entityCount: info.entityCount,
        attributeNodeCount: info.attributeNodeCount,
      },
    };
  } finally {
    await rpc.call<void>('close', { handle: info.handle }).catch(() => undefined);
  }
}

async function createRvmRpc(): Promise<RvmRpcClient> {
  if (!window.RvmRpc) throw new Error('RvmRpc 未加载：index.html 需先引入 /rvmsdk/rvm-rpc.js');
  const rpc = new window.RvmRpc({ workerUrl: WORKER_URL });
  rpc.start();
  await rpc.ready();
  return rpc;
}
