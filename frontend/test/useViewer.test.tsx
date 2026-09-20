import { useEffect } from 'react';
import * as THREE from 'three';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataChannelHandlers } from '../src/channels/dataChannels.js';
import { CHANNEL, MSG, PROTOCOL_VERSION } from '../src/protocol.js';
import type { ViewerController } from '../src/hooks/useViewer.js';
import type { RvmModelSession, RvmTreeNode } from '../src/viewer/rvmSdk.js';

const mocks = vi.hoisted(() => ({
  handlers: undefined as unknown,
  cleanup: vi.fn(),
  initDataChannels: vi.fn(),
  engineInstances: 0,
  engineDispose: vi.fn(),
  engineSetObject: vi.fn(),
  engineFrameModel: vi.fn(),
  engineResetCamera: vi.fn(),
  objectResult: { vertices: 9, triangles: 3 },
  importRvmModel: vi.fn(),
  readLocalRvm: vi.fn(),
}));

vi.mock('../src/channels/dataChannels.js', () => ({
  initDataChannels: (handlers: unknown) => {
    mocks.handlers = handlers;
    mocks.initDataChannels(handlers);
    return mocks.cleanup;
  },
}));

vi.mock('../src/viewer/ViewerEngine.js', () => ({
  ViewerEngine: class {
    constructor() {
      mocks.engineInstances += 1;
    }
    setObject3D(object: THREE.Object3D) {
      mocks.engineSetObject(object);
      return mocks.objectResult;
    }
    frameModel(): void {
      mocks.engineFrameModel();
    }
    resetCamera(): void {
      mocks.engineResetCamera();
    }
    dispose(): void {
      mocks.engineDispose();
    }
  },
}));

vi.mock('../src/viewer/rvmSdk.js', () => ({ importRvmModel: mocks.importRvmModel }));
vi.mock('../src/viewer/localModel.js', () => ({ readLocalRvm: mocks.readLocalRvm }));

import { useViewer } from '../src/hooks/useViewer.js';

let controller: ViewerController | null = null;

function Harness(): React.JSX.Element {
  const value = useViewer(1024);
  useEffect(() => {
    controller = value;
  });
  return <canvas ref={value.canvasRef} />;
}

function NoCanvasHarness(): React.JSX.Element {
  useViewer(1024);
  return <div />;
}

function handlers(): DataChannelHandlers {
  if (!mocks.handlers) throw new Error('data channel handlers were not installed');
  return mocks.handlers as DataChannelHandlers;
}

function current(): ViewerController {
  if (!controller) throw new Error('viewer hook was not rendered');
  return controller;
}

function fakeFile(name: string): File {
  return { name, size: 3, arrayBuffer: async () => new ArrayBuffer(3) } as unknown as File;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const child: RvmTreeNode = {
  name: 'child',
  segments: ['plant', 'child'],
  visible: true,
  excluded: false,
  entityCount: 1,
  propertyCount: 1,
  children: [],
};

const tree: RvmTreeNode = {
  name: 'plant',
  segments: ['plant'],
  visible: true,
  excluded: false,
  entityCount: 2,
  propertyCount: 1,
  children: [child],
};

function importedModel(name = 'plant.rvm', overrides: Partial<RvmModelSession> = {}): RvmModelSession {
  return {
    object: new THREE.Group(),
    meta: { sourceFile: name, sourceFormat: 'RVM', nodeCount: 2, entityCount: 4, attributeNodeCount: 0 },
    tree,
    attributeStats: { loaded: true, attached: 2, missed: 1 },
    getProperties: vi.fn().mockResolvedValue([{ name: 'Tag', value: 'P-101' }]),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  controller = null;
  mocks.handlers = undefined;
  mocks.cleanup.mockReset();
  mocks.initDataChannels.mockReset();
  mocks.engineDispose.mockReset();
  mocks.engineSetObject.mockReset();
  mocks.engineFrameModel.mockReset();
  mocks.engineResetCamera.mockReset();
  mocks.importRvmModel.mockReset();
  mocks.readLocalRvm.mockReset();
  mocks.objectResult = { vertices: 9, triangles: 3 };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useViewer', () => {
  it('maps all file-channel statuses and cleans up its engine', async () => {
    const rendered = render(<Harness />);
    await act(async () => {
      handlers().onStatus(CHANNEL.FILE, 'loading');
    });
    expect(current().ui.phase).toBe('loading');
    await act(async () => {
      handlers().onStatus(CHANNEL.FILE, 'parsing');
    });
    expect(current().ui.phase).toBe('parsing');
    await act(async () => {
      handlers().onStatus(CHANNEL.NONE, 'empty');
    });
    expect(current().ui).toMatchObject({ source: CHANNEL.NONE, phase: 'idle' });

    await act(async () => {
      handlers().onError('网络断开');
    });
    expect(current().ui).toMatchObject({ phase: 'error', error: '网络断开' });

    rendered.unmount();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.engineDispose).toHaveBeenCalledOnce();
  });

  it('renders a workspace RVM and sends a parent completion message', async () => {
    const parent = { postMessage: vi.fn() } as unknown as WindowProxy;
    const descriptor = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', { configurable: true, value: parent });
    mocks.importRvmModel.mockImplementation(async (_bytes: ArrayBuffer, _name: string, options) => {
      options.onProgress?.('正在解析 RVM 场景…');
      return importedModel();
    });
    render(<Harness />);

    await act(async () => {
      await expect(handlers().onRvmFile({ bytes: new ArrayBuffer(3), name: 'plant.rvm' })).resolves.toBe(
        true
      );
    });
    expect(current().ui).toMatchObject({ phase: 'loaded', source: CHANNEL.FILE, name: 'plant.rvm' });
    expect(current().ui.detail).toContain('节点 2');
    expect(current().tree).toBe(tree);
    expect(current().selectedNode).toBe(tree);
    expect(current().properties).toEqual([{ name: 'Tag', value: 'P-101' }]);
    expect(current().attributeStats).toEqual({ loaded: true, attached: 2, missed: 1 });
    expect(parent.postMessage).toHaveBeenCalledWith(
      { v: PROTOCOL_VERSION, type: MSG.RENDERED, name: 'plant.rvm', vertices: 9, triangles: 3 },
      '*'
    );
    if (descriptor) Object.defineProperty(window, 'parent', descriptor);
  });

  it('reports RVM parser failure without a parent frame', async () => {
    mocks.importRvmModel.mockRejectedValueOnce('损坏');
    render(<Harness />);
    await act(async () => {
      await expect(handlers().onRvmFile({ bytes: new ArrayBuffer(3), name: 'bad.rvm' })).resolves.toBe(false);
    });
    expect(current().ui).toMatchObject({ phase: 'error', error: 'RVM 解析失败：损坏' });
  });

  it('loads local RVM files and reports local read errors', async () => {
    mocks.readLocalRvm.mockResolvedValueOnce({ bytes: new ArrayBuffer(4), name: 'local.rvm' });
    mocks.importRvmModel.mockResolvedValueOnce(importedModel('local.rvm'));
    render(<Harness />);
    await act(async () => {
      await current().loadLocalRvm(fakeFile('local.rvm'));
    });
    expect(mocks.readLocalRvm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'local.rvm' }),
      1024,
      undefined
    );
    expect(current().ui).toMatchObject({ source: CHANNEL.LOCAL, phase: 'loaded' });

    mocks.readLocalRvm.mockRejectedValueOnce(new Error('文件过大'));
    await act(async () => {
      await current().loadLocalRvm(fakeFile('large.rvm'));
    });
    expect(current().ui).toMatchObject({
      source: CHANNEL.LOCAL,
      phase: 'error',
      error: 'RVM 文件加载失败：文件过大',
    });
  });

  it('forwards local attributes and replaces the previous model session', async () => {
    const first = importedModel('first.rvm');
    const second = importedModel('second.rvm');
    const attrs = new ArrayBuffer(5);
    mocks.readLocalRvm
      .mockResolvedValueOnce({ bytes: new ArrayBuffer(4), name: 'first.rvm' })
      .mockResolvedValueOnce({ bytes: new ArrayBuffer(6), name: 'second.rvm', attrs });
    mocks.importRvmModel.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    render(<Harness />);

    await act(async () => {
      await current().loadLocalRvm(fakeFile('first.rvm'));
      await current().loadLocalRvm(fakeFile('second.rvm'), fakeFile('second.txt'));
    });
    expect(mocks.readLocalRvm).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'second.rvm' }),
      1024,
      expect.objectContaining({ name: 'second.txt' })
    );
    expect(mocks.importRvmModel).toHaveBeenLastCalledWith(
      expect.any(ArrayBuffer),
      'second.rvm',
      expect.objectContaining({ attrs })
    );
    expect(first.close).toHaveBeenCalledOnce();
    expect(current().ui.name).toBe('second.rvm');
  });

  it('loads properties for tree selections and reports query errors', async () => {
    const session = importedModel();
    vi.mocked(session.getProperties)
      .mockResolvedValueOnce([{ name: 'Root', value: 'yes' }])
      .mockResolvedValueOnce([{ name: 'Tag', value: 'child' }])
      .mockRejectedValueOnce('not available');
    mocks.importRvmModel.mockResolvedValueOnce(session);
    render(<Harness />);
    await act(async () => {
      await handlers().onRvmFile({ bytes: new ArrayBuffer(3), name: 'plant.rvm' });
    });

    await act(async () => {
      await current().selectNode(child);
    });
    expect(session.getProperties).toHaveBeenLastCalledWith(['plant', 'child']);
    expect(current().properties).toEqual([{ name: 'Tag', value: 'child' }]);
    expect(current().propertyPhase).toBe('loaded');

    await act(async () => {
      await current().selectNode(tree);
    });
    expect(current().propertyPhase).toBe('error');
    expect(current().propertyError).toBe('节点属性读取失败：not available');
  });

  it('ignores stale successful and failed property requests', async () => {
    const rootRequest = deferred<Array<{ name: string; value: string }>>();
    const childRequest = deferred<Array<{ name: string; value: string }>>();
    const staleFailure = deferred<Array<{ name: string; value: string }>>();
    const latestRequest = deferred<Array<{ name: string; value: string }>>();
    const session = importedModel();
    vi.mocked(session.getProperties)
      .mockImplementationOnce(() => rootRequest.promise)
      .mockImplementationOnce(() => childRequest.promise)
      .mockImplementationOnce(() => staleFailure.promise)
      .mockImplementationOnce(() => latestRequest.promise);
    mocks.importRvmModel.mockResolvedValueOnce(session);
    render(<Harness />);

    await act(async () => {
      await handlers().onRvmFile({ bytes: new ArrayBuffer(3), name: 'plant.rvm' });
    });
    const childSelection = current().selectNode(child);
    await act(async () => {
      rootRequest.resolve([{ name: 'stale', value: 'root' }]);
      await rootRequest.promise;
    });
    expect(current().selectedNode).toBe(child);
    expect(current().properties).toEqual([]);
    await act(async () => {
      childRequest.resolve([{ name: 'Tag', value: 'child' }]);
      await childSelection;
    });
    expect(current().properties).toEqual([{ name: 'Tag', value: 'child' }]);

    const failedSelection = current().selectNode(tree);
    const latestSelection = current().selectNode(child);
    await act(async () => {
      staleFailure.reject(new Error('stale failure'));
      await failedSelection;
    });
    expect(current().propertyPhase).toBe('loading');
    await act(async () => {
      latestRequest.resolve([{ name: 'Latest', value: 'yes' }]);
      await latestSelection;
    });
    expect(current().properties).toEqual([{ name: 'Latest', value: 'yes' }]);
  });

  it('loads the development test RVM and handles test fetch failures', async () => {
    mocks.importRvmModel.mockResolvedValueOnce(importedModel('WD1-PSUP.RVM'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) })
    );
    render(<Harness />);
    await act(async () => {
      await current().loadTestRvm();
    });
    expect(fetch).toHaveBeenCalledWith('/__rvm-testdata/WD1-PSUP.RVM');
    expect(fetch).toHaveBeenCalledWith('/__rvm-testdata/WD1-PSUP.txt');
    expect(current().ui).toMatchObject({ source: CHANNEL.TEST, phase: 'loaded' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await act(async () => {
      await current().loadTestRvm();
    });
    expect(current().ui).toMatchObject({
      source: CHANNEL.TEST,
      phase: 'error',
      error: '测试 RVM 加载失败：RVM HTTP 404',
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) })
        .mockResolvedValueOnce({ ok: false, status: 403 })
    );
    await act(async () => {
      await current().loadTestRvm();
    });
    expect(current().ui.error).toBe('测试 RVM 加载失败：属性 HTTP 403');
  });

  it('forwards camera commands to the active engine', () => {
    render(<Harness />);
    void current().selectNode(tree);
    current().frameCamera();
    current().resetCamera();
    expect(mocks.engineFrameModel).toHaveBeenCalledOnce();
    expect(mocks.engineResetCamera).toHaveBeenCalledOnce();
  });

  it('ignores work that completes after unmount and no-ops without an engine', async () => {
    let resolveRead: ((value: { bytes: ArrayBuffer; name: string }) => void) | undefined;
    mocks.readLocalRvm.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );
    const rendered = render(<Harness />);
    const pending = current().loadLocalRvm(fakeFile('late.rvm'));
    rendered.unmount();
    await act(async () => {
      resolveRead?.({ bytes: new ArrayBuffer(3), name: 'late.rvm' });
      await pending;
      await current().loadLocalRvm(fakeFile('after-unmount.rvm'));
      await current().loadTestRvm();
    });
    expect(mocks.importRvmModel).not.toHaveBeenCalled();
  });

  it('ignores a stale RVM import after unmount', async () => {
    let resolveImport: ((value: ReturnType<typeof importedModel>) => void) | undefined;
    mocks.importRvmModel.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImport = resolve;
      })
    );
    const rendered = render(<Harness />);
    const pending = handlers().onRvmFile({ bytes: new ArrayBuffer(3), name: 'late.rvm' });
    rendered.unmount();
    await act(async () => {
      resolveImport?.(importedModel('late.rvm'));
      await expect(pending).resolves.toBe(false);
    });
    expect(mocks.engineSetObject).not.toHaveBeenCalled();
  });

  it('closes a candidate session when installing it fails', async () => {
    const session = importedModel('broken.rvm');
    mocks.importRvmModel.mockResolvedValueOnce(session);
    mocks.engineSetObject.mockImplementationOnce(() => {
      throw new Error('renderer failed');
    });
    render(<Harness />);
    await act(async () => {
      await expect(handlers().onRvmFile({ bytes: new ArrayBuffer(3), name: 'broken.rvm' })).resolves.toBe(
        false
      );
    });
    expect(session.close).toHaveBeenCalledOnce();
    expect(current().ui.error).toBe('RVM 解析失败：renderer failed');
  });

  it('does not initialize an engine when no canvas is mounted', () => {
    render(<NoCanvasHarness />);
    expect(mocks.initDataChannels).not.toHaveBeenCalled();
  });
});
