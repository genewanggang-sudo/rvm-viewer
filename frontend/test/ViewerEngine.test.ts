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
    enablePan = false;
    target = {
      x: 0,
      y: 0,
      z: 0,
      copy: (value: { x: number; y: number; z: number }) => {
        this.target.x = value.x;
        this.target.y = value.y;
        this.target.z = value.z;
        return this.target;
      },
    };
    update = doubles.controlsUpdate;
    dispose = doubles.controlsDispose;
  },
}));

import { ViewerEngine } from '../src/viewer/ViewerEngine.js';

function canvas(withLayout = true): HTMLCanvasElement {
  const element = document.createElement('canvas');
  if (withLayout)
    Object.defineProperties(element, { clientWidth: { value: 640 }, clientHeight: { value: 480 } });
  return element;
}

describe('ViewerEngine', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders, counts, replaces, and disposes RVM scene meshes', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = new ViewerEngine(canvas());
    const first = new THREE.Group();
    first.add(new THREE.Object3D());
    first.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
    first.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    first.add(new THREE.Mesh(new THREE.BoxGeometry().toNonIndexed(), [new THREE.MeshBasicMaterial()]));

    expect(engine.setObject3D(first)).toEqual({ vertices: 60, triangles: 24 });
    engine.frameModel();
    engine.resetCamera();
    expect(engine.setObject3D(new THREE.Group())).toEqual({ vertices: 0, triangles: 0 });
    const camera = Reflect.get(engine, 'camera') as THREE.PerspectiveCamera;
    const target = Reflect.get(engine, 'controls').target as { x: number; y: number; z: number };
    camera.position.set(target.x, target.y, target.z);
    engine.frameModel();
    engine.clear();
    window.dispatchEvent(new Event('resize'));
    engine.dispose();
    engine.dispose();

    expect(doubles.setClearColor).toHaveBeenCalledWith(0x101418, 1);
    expect(doubles.setSize).toHaveBeenCalledWith(640, 480, false);
    expect(doubles.controlsDispose).toHaveBeenCalledOnce();
    expect(doubles.rendererDispose).toHaveBeenCalledOnce();
  });

  it('uses viewport fallbacks and stops scheduled frames after disposal', () => {
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => ((scheduled = callback), 9))
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    const engine = new ViewerEngine(canvas(false));
    engine.dispose();
    scheduled?.(0);

    expect(doubles.setSize).toHaveBeenCalledWith(window.innerWidth, window.innerHeight, false);
    expect(doubles.setPixelRatio).toHaveBeenCalledWith(1);
  });
});
