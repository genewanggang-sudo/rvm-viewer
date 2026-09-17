import { useEffect } from 'react';
import * as THREE from 'three';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataChannelHandlers } from '../src/channels/dataChannels.js';
import { CHANNEL, type GeometryData, type RenderStats } from '../src/protocol.js';
import type { ViewerController } from '../src/hooks/useViewer.js';

const mocks = vi.hoisted(() => ({
  handlers: undefined as unknown,
  cleanup: vi.fn(),
  initDataChannels: vi.fn(),
  engineInstances: 0,
  engineDispose: vi.fn(),
  engineSetData: vi.fn(),
  engineSetObject: vi.fn(),
  dataResult: { vertices: 3, triangles: 1 } as { vertices: number; triangles: number } | null,
  objectResult: { vertices: 9, triangles: 3 },
  importRvmModel: vi.fn(),
  parseLocalModel: vi.fn(),
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

    setData(data: GeometryData): RenderStats | null {
      mocks.engineSetData(data);
      return mocks.dataResult;
    }

    setObject3D(object: THREE.Object3D): RenderStats {
      mocks.engineSetObject(object);
      return mocks.objectResult;
    }

    dispose(): void {
      mocks.engineDispose();
    }
  },
}));

vi.mock('../src/viewer/rvmSdk.js', () => ({ importRvmModel: mocks.importRvmModel }));
vi.mock('../src/viewer/localModel.js', () => ({ parseLocalModel: mocks.parseLocalModel }));

import { useViewer } from '../src/hooks/useViewer.js';

const geometry: GeometryData = { name: 'cube.obj', format: 'OBJ', pos: [0, 0, 0], tris: [0, 0, 0] };

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

function fakeFile(name: string, bytes = new ArrayBuffer(2)): File {
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes } as unknown as File;
}

describe('useViewer', () => {
  beforeEach(() => {
    controller = null;
    mocks.handlers = undefined;
    mocks.cleanup.mockReset();
    mocks.initDataChannels.mockReset();
    mocks.engineDispose.mockReset();
    mocks.engineSetData.mockReset();
    mocks.engineSetObject.mockReset();
    mocks.importRvmModel.mockReset();
    mocks.parseLocalModel.mockReset();
    mocks.dataResult = { vertices: 3, triangles: 1 };
    mocks.objectResult = { vertices: 9, triangles: 3 };
  });

  afterEach(() => vi.clearAllMocks());

  it('maps channel statuses, geometry, and errors into UI state', async () => {
    const rendered = render(<Harness />);
    expect(mocks.initDataChannels).toHaveBeenCalledOnce();

    await act(async () => {
      handlers().onStatus(CHANNEL.FILE, 'loading');
      handlers().onStatus(CHANNEL.FILE, 'parsing');
      handlers().onStatus(CHANNEL.FILE, 'waiting');
      handlers().onStatus(CHANNEL.FILE, 'loaded');
      handlers().onStatus(CHANNEL.FILE, 'empty');
    });
    expect(current().ui.phase).toBe('idle');

    await act(async () => {
      expect(handlers().onGeometry(geometry)).toEqual({ vertices: 3, triangles: 1 });
    });
    expect(current().ui).toMatchObject({
      phase: 'loaded',
      name: 'cube.obj',
      format: 'OBJ',
      vertices: 3,
      triangles: 1,
    });

    await act(async () => {
      expect(handlers().onGeometry({ pos: [0, 0, 0], tris: [0, 0, 0] })).toEqual({
        vertices: 3,
        triangles: 1,
      });
    });
    expect(current().ui).toMatchObject({ name: 'cube.obj', format: '-' });

    mocks.dataResult = null;
    await act(async () => {
      expect(handlers().onGeometry(geometry)).toBeNull();
      handlers().onError('网络断开');
    });
    expect(current().ui).toMatchObject({ phase: 'error', error: '网络断开' });

    rendered.unmount();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.engineDispose).toHaveBeenCalledOnce();
  });

  it('does not initialize an engine when no canvas is mounted', () => {
    render(<NoCanvasHarness />);
    expect(mocks.initDataChannels).not.toHaveBeenCalled();
  });

  it('renders RVM buffers through the SDK and reports parser failure', async () => {
    mocks.importRvmModel.mockImplementation(
      async (_bytes: ArrayBuffer, _name: string, options: { onProgress?: (message: string) => void }) => {
        options.onProgress?.('正在解析 RVM 场景…');
        return {
          object: new THREE.Group(),
          meta: {
            sourceFile: 'plant.rvm',
            sourceFormat: 'RVM',
            nodeCount: 2,
            entityCount: 4,
            attributeNodeCount: 1,
          },
        };
      }
    );
    render(<Harness />);

    await act(async () => {
      await expect(handlers().onFileBuffer?.({ bytes: new ArrayBuffer(3), name: 'plant.rvm' })).resolves.toBe(
        true
      );
    });
    expect(current().ui).toMatchObject({ phase: 'loaded', name: 'plant.rvm', vertices: 9, triangles: 3 });
    expect(current().ui.detail).toContain('节点 2');

    mocks.importRvmModel.mockRejectedValueOnce(new Error('损坏'));
    await act(async () => {
      await expect(handlers().onFileBuffer?.({ bytes: new ArrayBuffer(3) })).resolves.toBe(false);
    });
    expect(current().ui).toMatchObject({ phase: 'error', error: 'RVM 解析失败：损坏' });
  });

  it('loads local geometry, RVM attributes, and reports parsing failures', async () => {
    mocks.parseLocalModel.mockResolvedValueOnce({ kind: 'geometry', data: geometry });
    render(<Harness />);

    await act(async () => {
      await current().loadLocalFiles(fakeFile('cube.obj'));
    });
    expect(mocks.parseLocalModel).toHaveBeenCalledWith(expect.objectContaining({ name: 'cube.obj' }), 1024);
    expect(current().ui).toMatchObject({ source: CHANNEL.LOCAL, phase: 'loaded' });

    mocks.parseLocalModel.mockResolvedValueOnce({
      kind: 'rvm',
      bytes: new ArrayBuffer(4),
      name: 'plant.rvm',
    });
    mocks.importRvmModel.mockResolvedValueOnce({
      object: new THREE.Group(),
      meta: {
        sourceFile: 'plant.rvm',
        sourceFormat: 'RVM',
        nodeCount: 0,
        entityCount: 0,
        attributeNodeCount: 0,
      },
    });
    await act(async () => {
      await current().loadLocalFiles(fakeFile('plant.rvm'), fakeFile('plant.att', new ArrayBuffer(5)));
    });
    expect(mocks.importRvmModel).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      'plant.rvm',
      expect.objectContaining({ attrs: expect.any(ArrayBuffer) })
    );

    mocks.parseLocalModel.mockResolvedValueOnce({
      kind: 'rvm',
      bytes: new ArrayBuffer(4),
      name: 'without-attributes.rvm',
    });
    mocks.importRvmModel.mockResolvedValueOnce({
      object: new THREE.Group(),
      meta: {
        sourceFile: 'without-attributes.rvm',
        sourceFormat: 'RVM',
        nodeCount: 0,
        entityCount: 0,
        attributeNodeCount: 0,
      },
    });
    await act(async () => {
      await current().loadLocalFiles(fakeFile('without-attributes.rvm'));
    });
    expect(mocks.importRvmModel).toHaveBeenLastCalledWith(
      expect.any(ArrayBuffer),
      'without-attributes.rvm',
      expect.objectContaining({ attrs: undefined })
    );

    mocks.parseLocalModel.mockRejectedValueOnce('失败');
    await act(async () => {
      await current().loadLocalFiles(fakeFile('bad.obj'));
    });
    expect(current().ui).toMatchObject({ phase: 'error', error: '本地文件加载失败：失败' });
  });

  it('stops stale file work after unmount', async () => {
    let resolveParse: ((value: { kind: 'geometry'; data: GeometryData }) => void) | undefined;
    mocks.parseLocalModel.mockReturnValueOnce(
      new Promise<{ kind: 'geometry'; data: GeometryData }>((resolve) => {
        resolveParse = resolve;
      })
    );
    const rendered = render(<Harness />);
    const pending = current().loadLocalFiles(fakeFile('late.obj'));
    rendered.unmount();

    await act(async () => {
      resolveParse?.({ kind: 'geometry', data: geometry });
      await pending;
    });
    expect(mocks.engineSetData).not.toHaveBeenCalled();

    await expect(current().loadLocalFiles(fakeFile('after-unmount.obj'))).resolves.toBeUndefined();
  });

  it('stops a stale RVM import after unmount', async () => {
    let resolveImport:
      | ((value: {
          object: THREE.Object3D;
          meta: {
            sourceFile: string;
            sourceFormat: string;
            nodeCount: number;
            entityCount: number;
            attributeNodeCount: number;
          };
        }) => void)
      | undefined;
    mocks.importRvmModel.mockReturnValueOnce(
      new Promise<{
        object: THREE.Object3D;
        meta: {
          sourceFile: string;
          sourceFormat: string;
          nodeCount: number;
          entityCount: number;
          attributeNodeCount: number;
        };
      }>((resolve) => {
        resolveImport = resolve;
      })
    );
    const rendered = render(<Harness />);
    const pending = handlers().onFileBuffer?.({ bytes: new ArrayBuffer(3), name: 'late.rvm' });
    rendered.unmount();

    await act(async () => {
      resolveImport?.({
        object: new THREE.Group(),
        meta: {
          sourceFile: 'late.rvm',
          sourceFormat: 'RVM',
          nodeCount: 0,
          entityCount: 0,
          attributeNodeCount: 0,
        },
      });
      await expect(pending).resolves.toBe(false);
    });
    expect(mocks.engineSetObject).not.toHaveBeenCalled();
  });

  it('stops after a stale local attribute read', async () => {
    let resolveAttribute: ((value: ArrayBuffer) => void) | undefined;
    mocks.parseLocalModel.mockResolvedValueOnce({ kind: 'rvm', bytes: new ArrayBuffer(3), name: 'late.rvm' });
    const lateAttribute = {
      name: 'late.att',
      size: 1,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          resolveAttribute = resolve;
        }),
    } as unknown as File;
    const rendered = render(<Harness />);
    const pending = current().loadLocalFiles(fakeFile('late.rvm'), lateAttribute);
    await act(async () => undefined);
    rendered.unmount();

    await act(async () => {
      resolveAttribute?.(new ArrayBuffer(1));
      await pending;
    });
    expect(mocks.importRvmModel).not.toHaveBeenCalled();
  });
});
