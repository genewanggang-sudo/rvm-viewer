import * as THREE from 'three';
import type * as ThreeModule from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => ({
  render: vi.fn(),
  setClearColor: vi.fn(),
  setPixelRatio: vi.fn(),
  setSize: vi.fn(),
  rendererDispose: vi.fn(),
  controlsUpdate: vi.fn(),
  controlsDispose: vi.fn(),
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeModule>();
  return {
    ...actual,
    WebGLRenderer: class {
      setClearColor = doubles.setClearColor;
      setPixelRatio = doubles.setPixelRatio;
      setSize = doubles.setSize;
      render = doubles.render;
      dispose = doubles.rendererDispose;
    },
  };
});

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    enableDamping = false;
    dampingFactor = 0;
    update = doubles.controlsUpdate;
    dispose = doubles.controlsDispose;
  },
}));

import { ViewerEngine } from '../src/viewer/ViewerEngine.js';

function canvas(): HTMLCanvasElement {
  const element = document.createElement('canvas');
  Object.defineProperties(element, {
    clientWidth: { value: 640 },
    clientHeight: { value: 480 },
  });
  return element;
}

function canvasWithoutLayout(): HTMLCanvasElement {
  return document.createElement('canvas');
}

describe('ViewerEngine', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders valid raw geometry, replaces it, and clears resources', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = new ViewerEngine(canvas());

    expect(engine.setData({ pos: [0, 0, 0], tris: [0, 0, 0] })).toEqual({ vertices: 1, triangles: 1 });
    expect(engine.setData({ pos: [], tris: [] })).toBeNull();
    expect(engine.setData({ pos: [0, 0, 0], tris: [0, 0, 0] })).toEqual({ vertices: 1, triangles: 1 });
    engine.clear();

    expect(doubles.setClearColor).toHaveBeenCalledWith(0x101418, 1);
    expect(doubles.setSize).toHaveBeenCalledWith(640, 480, false);
  });

  it('counts mesh geometry, ignores non-renderable nodes, and disposes once', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 8)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = new ViewerEngine(canvas());
    const root = new THREE.Group();
    root.add(new THREE.Object3D());
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    root.add(new THREE.Mesh(new THREE.BoxGeometry().toNonIndexed(), [new THREE.MeshBasicMaterial()]));

    expect(engine.setObject3D(root)).toEqual({ vertices: 60, triangles: 24 });
    window.dispatchEvent(new Event('resize'));
    engine.dispose();
    engine.dispose();

    expect(doubles.controlsDispose).toHaveBeenCalledTimes(1);
    expect(doubles.rendererDispose).toHaveBeenCalledTimes(1);
    expect(doubles.setPixelRatio).toHaveBeenCalled();
  });

  it('uses viewport fallbacks and exits a scheduled frame after disposal', () => {
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        scheduled = callback;
        return 9;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    const engine = new ViewerEngine(canvasWithoutLayout());
    engine.dispose();
    scheduled?.(0);

    expect(doubles.setSize).toHaveBeenCalledWith(window.innerWidth, window.innerHeight, false);
    expect(doubles.setPixelRatio).toHaveBeenCalledWith(1);
  });
});
