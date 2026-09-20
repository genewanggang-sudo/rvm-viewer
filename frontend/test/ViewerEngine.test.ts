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
    const camera = Reflect.get(engine, 'camera') as THREE.OrthographicCamera;
    expect(camera.isOrthographicCamera).toBe(true);
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

  it('highlights a subtree with a shared material and restores the originals', () => {
    installResizeObserver();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = new ViewerEngine(canvas());
    const plainMaterial = new THREE.MeshStandardMaterial({ color: 0xd14d72 });
    const arrayMaterialA = new THREE.MeshStandardMaterial({ color: 0x4dd17a });
    const arrayMaterialB = new THREE.MeshStandardMaterial({ color: 0x4d7ad1 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), plainMaterial);
    const arrayMesh = new THREE.Mesh(new THREE.BoxGeometry(), [arrayMaterialA, arrayMaterialB]);
    const subtree = new THREE.Group();
    subtree.add(mesh, arrayMesh);

    engine.setObject3D(new THREE.Group());
    engine.setHighlighted(subtree);
    const highlight = mesh.material as THREE.Material;
    expect(highlight).not.toBe(plainMaterial);
    expect(arrayMesh.material).toBe(highlight);

    engine.setHighlighted(null);
    expect(mesh.material).toBe(plainMaterial);
    expect(arrayMesh.material).toEqual([arrayMaterialA, arrayMaterialB]);

    engine.setHighlighted(new THREE.Group());
    engine.dispose();
  });

  it('frames a subtree box, keeps the viewport when the box is empty, and toggles visibility', () => {
    installResizeObserver();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = new ViewerEngine(canvas());
    engine.setObject3D(new THREE.Group());
    const controls = Reflect.get(engine, 'controls') as { target: { x: number; y: number; z: number } };

    const empty = new THREE.Group();
    engine.frameObject(empty);
    expect(controls.target.x).toBe(0);
    expect(controls.target.y).toBe(0);
    expect(controls.target.z).toBe(0);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    const offset = new THREE.Group();
    offset.position.set(4, 0, 0);
    offset.add(mesh);
    engine.frameObject(offset, false);
    expect(controls.target.x).toBeCloseTo(4, 5);
    expect(controls.target.y).toBeCloseTo(0, 5);
    expect(controls.target.z).toBeCloseTo(0, 5);

    // Camera sitting exactly on the target falls back to the isometric approach.
    const camera = Reflect.get(engine, 'camera') as THREE.OrthographicCamera;
    camera.position.copy(new THREE.Vector3(4, 0, 0));
    engine.frameObject(offset, false);
    expect(controls.target.x).toBeCloseTo(4, 5);

    // 竖直视角使用备用 up 轴，避免投影基向量退化。
    camera.position.set(4, 3, 0);
    engine.frameObject(offset, false);
    expect(camera.zoom).toBeGreaterThan(0);

    const parent = new THREE.Group();
    const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    parent.add(child);
    engine.setSubtreeVisible(parent, false);
    expect(parent.visible).toBe(false);
    expect(child.visible).toBe(true);
    engine.setSubtreeVisible(parent, true);
    expect(parent.visible).toBe(true);
    engine.dispose();
  });

  it('picks scene objects from click events and ignores drags, buttons, and hidden meshes', () => {
    installResizeObserver();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const element = canvas();
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 640,
      height: 480,
    } as DOMRect);
    const engine = new ViewerEngine(element);
    const picks: Array<THREE.Object3D | null> = [];
    engine.setSelectionHandler((object) => picks.push(object));

    const pointer = (type: string, x: number, y: number, button = 0): void => {
      element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button }));
    };

    // No scene installed yet: the pick completes with no hit.
    pointer('pointerdown', 320, 240);
    pointer('pointerup', 320, 240);
    expect(picks).toEqual([null]);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    engine.setObject3D(mesh);
    // OrbitControls 是 mock：相机姿态不会自动朝向目标，拾取前手动对准场景中心。
    const camera = Reflect.get(engine, 'camera') as THREE.OrthographicCamera;
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    // Drags beyond the pick slop are orbit gestures, not selections.
    pointer('pointerdown', 320, 240);
    pointer('pointerup', 340, 240);
    expect(picks).toHaveLength(1);

    // Non-primary buttons never pick.
    pointer('pointerdown', 320, 240, 2);
    pointer('pointerup', 320, 240, 2);
    expect(picks).toHaveLength(1);

    // Leaving the canvas cancels a pending press.
    pointer('pointerdown', 320, 240);
    element.dispatchEvent(new Event('pointerleave'));
    pointer('pointerup', 320, 240);
    expect(picks).toHaveLength(1);

    // A plain click picks the mesh under the cursor.
    pointer('pointerdown', 320, 240);
    pointer('pointerup', 320, 240);
    expect(picks).toEqual([null, mesh]);

    // Hidden meshes are not pickable.
    mesh.visible = false;
    pointer('pointerdown', 320, 240);
    pointer('pointerup', 320, 240);
    expect(picks).toEqual([null, mesh, null]);

    mesh.visible = true;
    engine.dispose();
    pointer('pointerdown', 320, 240);
    pointer('pointerup', 320, 240);
    expect(picks).toHaveLength(3);
  });

  it('animates camera framing and cancels the tween when the user interacts', async () => {
    installResizeObserver();
    let rafCb: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        rafCb = cb;
        return 1;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const element = canvas();
    const engine = new ViewerEngine(element);
    engine.setObject3D(new THREE.Group());
    const controls = Reflect.get(engine, 'controls') as { target: { x: number; y: number; z: number } };
    const pump = async (ms: number): Promise<void> => {
      const deadline = performance.now() + ms;
      while (performance.now() < deadline) {
        rafCb?.(0);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    const offset = new THREE.Group();
    offset.position.set(4, 0, 0);
    offset.add(mesh);
    engine.frameObject(offset);
    expect(controls.target.x).toBe(0); // 动画未推进前相机保持原地

    await pump(1500);
    expect(controls.target.x).toBeCloseTo(4, 1);

    // 用户交互取消动画：拖拽或滚轮都会立即停止插值
    engine.frameObject(offset);
    element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    const frozenX = controls.target.x;
    await pump(200);
    expect(controls.target.x).toBeCloseTo(frozenX, 3);

    engine.frameObject(offset);
    element.dispatchEvent(new Event('wheel'));
    await pump(200);
    expect(controls.target.x).toBeCloseTo(frozenX, 3);
    engine.dispose();
  });

  it('skips picking when the canvas has no measurable layout', () => {
    installResizeObserver();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const element = canvas();
    const engine = new ViewerEngine(element);
    const picks: Array<THREE.Object3D | null> = [];
    engine.setSelectionHandler((object) => picks.push(object));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    engine.setObject3D(mesh);

    element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, button: 0 }));
    element.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 10, button: 0 }));
    expect(picks).toEqual([]);

    engine.setSelectionHandler(null);
    engine.dispose();
  });
});
