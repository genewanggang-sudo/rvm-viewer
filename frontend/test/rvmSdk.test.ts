import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  });

  it('allows retrying after the SDK script was unavailable', async () => {
    const { getRvmRpc } = await import('../src/viewer/rvmSdk.js');
    await expect(getRvmRpc()).rejects.toThrow('RvmRpc 未加载');

    const rpc = createRpc();
    installRpc(rpc);
    await expect(getRvmRpc()).resolves.toBe(rpc);
  });

  it('imports, previews, and closes an RVM handle even when close fails', async () => {
    const rpc = createRpc();
    const scene = new THREE.Group();
    doubles.parseAsync.mockResolvedValue({ scene });
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open') {
        return {
          handle: 'handle-1',
          sourceFile: 'plant.rvm',
          sourceFormat: 'rvm',
          nodeCount: 3,
          entityCount: 2,
          attributeNodeCount: 1,
        };
      }
      if (operation === 'preview') return new Uint8Array([1, 2, 3]);
      throw new Error('close failed');
    });
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');
    const bytes = new ArrayBuffer(8);
    const attributes = new ArrayBuffer(4);
    const progress = vi.fn();

    await expect(
      importRvmModel(bytes, 'uploaded.rvm', { attrs: attributes, onProgress: progress })
    ).resolves.toEqual({
      object: scene,
      meta: {
        sourceFile: 'plant.rvm',
        sourceFormat: 'RVM',
        nodeCount: 3,
        entityCount: 2,
        attributeNodeCount: 1,
      },
    });
    expect(rpc.call).toHaveBeenNthCalledWith(1, 'open', { name: 'uploaded.rvm', bytes, attrs: attributes }, [
      bytes,
      attributes,
    ]);
    expect(rpc.call).toHaveBeenNthCalledWith(2, 'preview', { handle: 'handle-1' });
    expect(rpc.call).toHaveBeenNthCalledWith(3, 'close', { handle: 'handle-1' });
    expect(progress).toHaveBeenCalledWith('正在解析 RVM 场景…');
    expect(progress).toHaveBeenCalledWith('正在生成三维预览…');
  });

  it('closes a successful open when preview generation fails', async () => {
    const rpc = createRpc();
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open') {
        return {
          handle: 'handle-2',
          sourceFile: 'bad.rvm',
          nodeCount: 0,
          entityCount: 0,
          attributeNodeCount: 0,
        };
      }
      if (operation === 'preview') throw new Error('preview failed');
      return undefined;
    });
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');

    await expect(importRvmModel(new ArrayBuffer(2), 'bad.rvm')).rejects.toThrow('preview failed');
    expect(rpc.call).toHaveBeenLastCalledWith('close', { handle: 'handle-2' });
  });

  it('normalizes a missing source format to an empty string', async () => {
    const rpc = createRpc();
    rpc.call.mockImplementation(async (operation: string) => {
      if (operation === 'open')
        return {
          handle: 'handle-3',
          sourceFile: 'formatless.rvm',
          nodeCount: 0,
          entityCount: 0,
          attributeNodeCount: 0,
        };
      if (operation === 'preview') return new Uint8Array([1]);
      return undefined;
    });
    doubles.parseAsync.mockResolvedValue({ scene: new THREE.Group() });
    installRpc(rpc);
    const { importRvmModel } = await import('../src/viewer/rvmSdk.js');

    await expect(importRvmModel(new ArrayBuffer(1), 'formatless.rvm')).resolves.toMatchObject({
      meta: { sourceFormat: '' },
    });
  });
});
