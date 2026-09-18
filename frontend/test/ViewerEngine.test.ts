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
  resizeObserve: vi.fn(),
  resizeDisconnect: vi.fn(),
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

function installResizeObserver(): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = doubles.resizeObserve;
      disconnect = doubles.resizeDisconnect;
    }
  );
}

describe('ViewerEngine', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders, counts, replaces, and disposes RVM scene meshes', () => {
    installResizeObserver();
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
    const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const coloredMaterial = new THREE.MeshStandardMaterial({ color: 0xd14d72 });
    first.add(new THREE.Mesh(new THREE.BoxGeometry(), defaultMaterial));
    first.add(new THREE.Mesh(new THREE.BoxGeometry(), coloredMaterial));
    const sharedDefault = new THREE.MeshStandardMaterial({ color: 0xffffff });
    first.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedDefault));
    first.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedDefault));
    const vertexColorGeometry = new THREE.BoxGeometry();
    vertexColorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(24 * 3).fill(1), 3));
    const vertexColorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    first.add(new THREE.Mesh(vertexColorGeometry, vertexColorMaterial));
    const texturedMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: new THREE.Texture() });
    first.add(new THREE.Mesh(new THREE.BoxGeometry(), texturedMaterial));
    const shaderMaterial = new THREE.ShaderMaterial({
      vertexShader: 'void main(){gl_Position=vec4(position,1.0);}',
      fragmentShader: 'void main(){gl_FragColor=vec4(1.0);}',
    });
    first.add(new THREE.Mesh(new THREE.BufferGeometry(), shaderMaterial));

    expect(engine.setObject3D(first)).toEqual({ vertices: 204, triangles: 96 });
    expect((defaultMaterial.color as THREE.Color).getHex()).toBe(0xffffff);
    const displayedDefault = (first.children[4] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const displayedColored = (first.children[5] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(displayedDefault.color.getHex()).toBe(0xb9c7d1);
    expect(displayedDefault).not.toBe(defaultMaterial);
    expect(displayedColored.color.getHex()).toBe(0xd14d72);
    expect((first.children[6] as THREE.Mesh).material).toBe((first.children[7] as THREE.Mesh).material);
    expect(((first.children[6] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      0xb9c7d1
    );
    expect((first.children[8] as THREE.Mesh).material).toBe(vertexColorMaterial);
    expect((first.children[9] as THREE.Mesh).material).toBe(texturedMaterial);
    expect((first.children[10] as THREE.Mesh).material).toBe(shaderMaterial);
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
    const renderer = Reflect.get(engine, 'renderer') as THREE.WebGLRenderer;
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.15);
    expect(doubles.setSize).toHaveBeenCalledWith(640, 480, false);
    expect(doubles.controlsDispose).toHaveBeenCalledOnce();
    expect(doubles.rendererDispose).toHaveBeenCalledOnce();
    expect(doubles.resizeObserve).toHaveBeenCalledOnce();
    expect(doubles.resizeDisconnect).toHaveBeenCalledOnce();
  });

  it('uses viewport fallbacks and stops scheduled frames after disposal', () => {
    installResizeObserver();
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

  it('maps the RVM preview neutral fallback color to the viewer default', () => {
    installResizeObserver();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = new ViewerEngine(canvas());
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0xa9a9a9 });
    const object = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial);

    engine.setObject3D(object);

    expect((object.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xb9c7d1);
    expect(object.material).not.toBe(sourceMaterial);
    engine.dispose();
  });
});
