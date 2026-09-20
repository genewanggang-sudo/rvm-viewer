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
  segments: string[];
  visible: boolean;
  excluded: boolean;
  entityCount: number;
  propertyCount: number;
  children: RvmTreeNode[];
}

/** 展示用路径（SDK 0.4.0 起 TreeNode 不再带 path，寻址一律用 segments）。 */
export function rvmNodeDisplayPath(node: Pick<RvmTreeNode, 'segments'>): string {
  return node.segments.length > 1 ? node.segments.slice(1).join('/') : '(根节点)';
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
  /** 结构树节点 → 三维场景对象（preview GLB 与 tree 同序同构配对，见联动设计文档）。 */
  resolveObject: (node: RvmTreeNode) => THREE.Object3D | null;
  /** 三维场景对象 → 最近的已映射结构树节点（沿祖先链上溯）。 */
  resolveNode: (object: THREE.Object3D) => RvmTreeNode | null;
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
    localizeSyntheticRoot(tree.root);

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
      ...createTreeSceneMapping(tree.root, gltf.scene),
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

/**
 * SDK 合成的根节点固定叫 "RootNode"，不是模型数据里的名字；
 * 展示层改为中文，寻址用的 segments 不受影响。
 */
function localizeSyntheticRoot(root: RvmTreeNode): void {
  if (root.name === 'RootNode') root.name = '根节点';
}

/**
 * preview GLB 的层级与 tree 逐层同名同序（WD1-PSUP 4677 节点实测 0 错配），
 * 按孩子索引配对即可建立双向映射；RVM 存在同名兄弟节点，不能按名字查找。
 * 孩子数不一致时告警一次并跳过该子树的更深层配对，联动静默降级。
 */
function createTreeSceneMapping(
  root: RvmTreeNode,
  scene: THREE.Object3D
): {
  resolveObject: (node: RvmTreeNode) => THREE.Object3D | null;
  resolveNode: (object: THREE.Object3D) => RvmTreeNode | null;
} {
  const nodeToObject = new WeakMap<RvmTreeNode, THREE.Object3D>();
  const objectToNode = new WeakMap<THREE.Object3D, RvmTreeNode>();
  const rootObject = scene.children.length === 1 ? scene.children[0] : scene;
  let mismatchWarned = false;

  const pair = (node: RvmTreeNode, object: THREE.Object3D): void => {
    nodeToObject.set(node, object);
    objectToNode.set(object, node);
    if (node.children.length !== object.children.length) {
      if (!mismatchWarned) {
        mismatchWarned = true;
        console.warn(
          `RVM 结构树与三维场景在「${node.name || '(未命名节点)'}」处层级不一致，部分节点无法定位`
        );
      }
      return;
    }
    for (let index = 0; index < node.children.length; index += 1) {
      pair(node.children[index], object.children[index]);
    }
  };
  pair(root, rootObject);

  return {
    resolveObject: (node) => nodeToObject.get(node) ?? null,
    resolveNode: (object) => {
      let current: THREE.Object3D | null = object;
      while (current) {
        const node = objectToNode.get(current);
        if (node) return node;
        current = current.parent;
      }
      return null;
    },
  };
}

async function createRvmRpc(): Promise<RvmRpcClient> {
  if (!window.RvmRpc) throw new Error('RvmRpc 未加载：index.html 需先引入 /rvmsdk/rvm-rpc.js');
  const rpc = new window.RvmRpc({ workerUrl: WORKER_URL });
  rpc.start();
  await rpc.ready();
  return rpc;
}
