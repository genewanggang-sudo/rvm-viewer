import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RvmTreeNode } from '../src/viewer/rvmSdk.js';

const doubles = vi.hoisted(() => ({ parseAsync: vi.fn() }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parseAsync = doubles.parseAsync;
  },
}));

interface FakeRpc {
  start: ReturnType<typeof vi.fn>;
  ready: ReturnType<typeof vi.fn>;
  call: ReturnType<typeof vi.fn>;
}

const tree: RvmTreeNode = {
  name: 'plant',
  path: '/plant',
  segments: ['plant'],
  visible: true,
  excluded: false,
  entityCount: 2,
  propertyCount: 1,
  children: [],
};

function installRpc(rpc: FakeRpc): void {
  const Constructor = vi.fn(function constructor() {
    return rpc;
  }) as unknown as NonNullable<Window['RvmRpc']>;
  window.RvmRpc = Constructor;
}

function createRpc(): FakeRpc {
  const rpc = {
    start: vi.fn(),
    ready: vi.fn().mockResolvedValue('1.0.0'),
    call: vi.fn(),
  };
  rpc.start.mockReturnValue(rpc);
  return rpc;
}

function openResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    handle: 'handle-1',
    sourceFile: 'plant.rvm',
    sourceFormat: 'rvm',
    nodeCount: 3,
    entityCount: 2,
    attributeNodeCount: 1,
    ...overrides,
  };
}

describe('RVM SDK adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete window.RvmRpc;
  });

  it('starts and caches the RPC client', async () => {
    const rpc = createRpc();
    installRpc(rpc);
    const { getRvmRpc } = await import('../src/viewer/rvmSdk.js');

    await expect(getRvmRpc()).resolves.toBe(rpc);
    await expect(getRvmRpc()).resolves.toBe(rpc);
    expect(rpc.start).toHaveBeenCalledOnce();
    expect(rpc.ready).toHaveBeenCalledOnce();
    expect(window.RvmRpc).toHaveBeenCalledWith({
      workerUrl: `${import.meta.env.BASE_URL}rvmsdk/rvm-worker.js`,
    });
  });

  it('loads the worker below the configured deployment base', async () => {
    vi.stubEnv('BASE_URL', '/sample/rvm-viewer/');
    try {
      const rpc = createRpc();
      installRpc(rpc);
      const { getRvmRpc } = await import('../src/viewer/rvmSdk.js');
      await getRvmRpc();
      expect(window.RvmRpc).toHaveBeenCalledWith({
        workerUrl: '/sample/rvm-viewer/rvmsdk/rvm-worker.js',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('allows retrying after the SDK script was unavailable', async () => {
    const { getRvmRpc } = await import('../src/viewer/rvmSdk.js');
    await expect(getRvmRpc()).rejects.toThrow('RvmRpc 未加载');

    const rpc = createRpc();
    installRpc(rpc);
    await expect(getRvmRpc()).resolves.toBe(rpc);
  });

  it('keeps an attributed model session open for tree and property queries', async () => {
    const rpc = createRpc();
    const scene = new THREE.Group();
    doubles.parseAsync.mockResolvedValue({ scene });
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open') return openResult();
      if (operation === 'attachAttributes') return { attached: 2, missed: 1 };
      if (operation === 'preview') return new Uint8Array([1, 2, 3]);
      if (operation === 'tree') return { root: tree };
      if (operation === 'getProperties') return { properties: [{ name: 'Tag', value: 'P-101' }] };
      if (operation === 'close') throw new Error('close failed');
      throw new Error(`unexpected operation ${operation}`);
    });
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');
    const bytes = new ArrayBuffer(8);
    const attributes = new ArrayBuffer(4);
    const progress = vi.fn();

    const session = await importRvmModel(bytes, 'uploaded.rvm', {
      attrs: attributes,
      onProgress: progress,
    });
    expect(session).toMatchObject({
      object: scene,
      tree,
      attributeStats: { loaded: true, attached: 2, missed: 1 },
      meta: {
        sourceFile: 'plant.rvm',
        sourceFormat: 'RVM',
        nodeCount: 3,
        entityCount: 2,
        attributeNodeCount: 2,
      },
    });
    expect(rpc.call).toHaveBeenNthCalledWith(1, 'open', { name: 'uploaded.rvm', bytes }, [bytes]);
    expect(rpc.call).toHaveBeenNthCalledWith(
      2,
      'attachAttributes',
      { handle: 'handle-1', bytes: attributes },
      [attributes]
    );
    await expect(session.getProperties(['plant'])).resolves.toEqual([{ name: 'Tag', value: 'P-101' }]);
    expect(rpc.call).toHaveBeenCalledWith('getProperties', {
      handle: 'handle-1',
      segments: ['plant'],
    });
    await expect(session.close()).resolves.toBeUndefined();
    await expect(session.close()).resolves.toBeUndefined();
    await expect(session.getProperties([])).rejects.toThrow('会话已关闭');
    expect(rpc.call.mock.calls.filter(([operation]) => operation === 'close')).toHaveLength(1);
    expect(progress).toHaveBeenCalledWith('正在解析 RVM 场景…');
    expect(progress).toHaveBeenCalledWith('正在生成三维预览…');
  });

  it('preserves built-in attribute counts when no external attributes are supplied', async () => {
    const rpc = createRpc();
    const scene = new THREE.Group();
    doubles.parseAsync.mockResolvedValue({ scene });
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open')
        return openResult({ sourceFile: 'formatless.rvm', sourceFormat: undefined, attributeNodeCount: 3 });
      if (operation === 'preview') return new Uint8Array([1]);
      if (operation === 'tree') return { root: tree };
      return undefined;
    });
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');

    const session = await importRvmModel(new ArrayBuffer(1), 'formatless.rvm');
    expect(session.meta).toMatchObject({ sourceFormat: '', attributeNodeCount: 3 });
    expect(session.attributeStats).toEqual({ loaded: false, attached: 0, missed: 0 });
    expect(rpc.call).not.toHaveBeenCalledWith('attachAttributes', expect.anything());
    await session.close();
  });

  it('keeps a display name separate from the RVM parser filename', async () => {
    const rpc = createRpc();
    const scene = new THREE.Group();
    doubles.parseAsync.mockResolvedValue({ scene });
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open') return openResult({ sourceFile: 'model.rvm' });
      if (operation === 'preview') return new Uint8Array([1]);
      if (operation === 'tree') return { root: tree };
      return undefined;
    });
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');

    const session = await importRvmModel(new ArrayBuffer(1), '工厂模型', {
      displayName: '工厂模型',
    });

    expect(rpc.call).toHaveBeenCalledWith(
      'open',
      { name: '工厂模型.rvm', bytes: expect.any(ArrayBuffer) },
      expect.any(Array)
    );
    expect(session.meta.sourceFile).toBe('工厂模型');
    await session.close();

    const fallback = await importRvmModel(new ArrayBuffer(1), '   ');
    expect(rpc.call).toHaveBeenCalledWith(
      'open',
      { name: 'model.rvm', bytes: expect.any(ArrayBuffer) },
      expect.any(Array)
    );
    await fallback.close();
  });

  it.each(['attachAttributes', 'preview', 'tree'])('closes the handle when %s fails', async (failure) => {
    const rpc = createRpc();
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open') return openResult();
      if (operation === failure) throw new Error(`${failure} failed`);
      if (operation === 'attachAttributes') return { attached: 1, missed: 0 };
      if (operation === 'preview') return new Uint8Array([1]);
      if (operation === 'tree') return { root: tree };
      return undefined;
    });
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');

    await expect(
      importRvmModel(new ArrayBuffer(2), 'bad.rvm', { attrs: new ArrayBuffer(1) })
    ).rejects.toThrow(`${failure} failed`);
    expect(rpc.call).toHaveBeenCalledWith('close', { handle: 'handle-1' });
  });

  it('closes the handle when GLTF parsing fails', async () => {
    const rpc = createRpc();
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open') return openResult();
      if (operation === 'preview') return new Uint8Array([1]);
      if (operation === 'tree') return { root: tree };
      return undefined;
    });
    doubles.parseAsync.mockRejectedValue(new Error('invalid GLB'));
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');

    await expect(importRvmModel(new ArrayBuffer(1), 'bad.rvm')).rejects.toThrow('invalid GLB');
    expect(rpc.call).toHaveBeenCalledWith('close', { handle: 'handle-1' });
  });
});
