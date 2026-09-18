import { useEffect } from 'react';
import * as THREE from 'three';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataChannelHandlers } from '../src/channels/dataChannels.js';
import { CHANNEL, MSG, PROTOCOL_VERSION } from '../src/protocol.js';
import type { ViewerController } from '../src/hooks/useViewer.js';

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

function importedModel(name = 'plant.rvm') {
  return {
    object: new THREE.Group(),
    meta: { sourceFile: name, sourceFormat: 'RVM', nodeCount: 2, entityCount: 4, attributeNodeCount: 0 },
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
    expect(mocks.readLocalRvm).toHaveBeenCalledWith(expect.objectContaining({ name: 'local.rvm' }), 1024);
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
    expect(current().ui).toMatchObject({ source: CHANNEL.TEST, phase: 'loaded' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await act(async () => {
      await current().loadTestRvm();
    });
    expect(current().ui).toMatchObject({
      source: CHANNEL.TEST,
      phase: 'error',
      error: '测试 RVM 加载失败：HTTP 404',
    });
  });

  it('forwards camera commands to the active engine', () => {
    render(<Harness />);
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

  it('does not initialize an engine when no canvas is mounted', () => {
    render(<NoCanvasHarness />);
    expect(mocks.initDataChannels).not.toHaveBeenCalled();
  });
});
