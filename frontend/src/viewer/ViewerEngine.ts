import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderStats } from '../protocol.js';

const BACKGROUND_COLOR = 0x101418;
const DEFAULT_MODEL_COLOR = 0xb9c7d1;
const HIGHLIGHT_COLOR = 0xffa43d;
const ISOMETRIC_DIRECTION = new THREE.Vector3(1.45, 1.1, 1.45).normalize();
const PICK_SLOP_PIXELS = 4;

interface CameraFrame {
  target: THREE.Vector3;
  distance: number;
}

export type ScenePickHandler = (object: THREE.Object3D | null) => void;

interface HighlightSwap {
  mesh: THREE.Mesh;
  material: THREE.Material | THREE.Material[];
}

export class ViewerEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly resizeHandler: () => void;
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly highlightMaterial = new THREE.MeshStandardMaterial({
    color: HIGHLIGHT_COLOR,
    emissive: HIGHLIGHT_COLOR,
    emissiveIntensity: 0.55,
    roughness: 0.6,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  });
  private readonly pointerDownHandler: (event: PointerEvent) => void;
  private readonly pointerUpHandler: (event: PointerEvent) => void;
  private readonly pointerLeaveHandler: () => void;
  private highlightSwaps: HighlightSwap[] = [];
  private selectionHandler: ScenePickHandler | null = null;
  private pointerDownPosition: { x: number; y: number } | null = null;
  private activeObject: THREE.Object3D | null = null;
  private frameId = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setClearColor(BACKGROUND_COLOR, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.camera.position.set(1.6, 1.1, 1.9);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x516477, 1.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(3, 5, 4);
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb8d0e5, 0.85);
    fillLight.position.set(-4, 2, -3);
    this.scene.add(fillLight);

    this.resizeHandler = () => this.resize();
    this.resizeObserver = new ResizeObserver(this.resizeHandler);
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resizeHandler);

    this.pointerDownHandler = (event) => {
      if (event.button !== 0) return;
      this.pointerDownPosition = { x: event.clientX, y: event.clientY };
    };
    this.pointerUpHandler = (event) => {
      const down = this.pointerDownPosition;
      this.pointerDownPosition = null;
      if (!down || !this.selectionHandler || event.button !== 0) return;
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > PICK_SLOP_PIXELS) return;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      const ndcX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const ndcY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      this.selectionHandler(this.pickAt(ndcX, ndcY));
    };
    this.pointerLeaveHandler = () => {
      this.pointerDownPosition = null;
    };
    canvas.addEventListener('pointerdown', this.pointerDownHandler);
    canvas.addEventListener('pointerup', this.pointerUpHandler);
    canvas.addEventListener('pointerleave', this.pointerLeaveHandler);

    this.resize();
    this.resetCamera();
    this.renderLoop();
  }

  setSelectionHandler(handler: ScenePickHandler | null): void {
    this.selectionHandler = handler;
  }

  /** 选中子树高亮：整体换用共享高亮材质，原材质记录在案以便还原。 */
  setHighlighted(object: THREE.Object3D | null): void {
    this.restoreHighlight();
    if (!object) return;
    object.traverse((node) => {
      if (!isRenderableMesh(node)) return;
      this.highlightSwaps.push({ mesh: node, material: node.material });
      node.material = this.highlightMaterial;
    });
  }

  setSubtreeVisible(object: THREE.Object3D, visible: boolean): void {
    object.visible = visible;
  }

  /** 相机对准子树包围盒（保持当前视角方向）；包围盒为空时不动。 */
  frameObject(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const direction = this.camera.position.clone().sub(this.controls.target);
    this.applyCameraFrame(this.frameFor(box), direction.lengthSq() > 0 ? direction : ISOMETRIC_DIRECTION);
  }

  setObject3D(object: THREE.Object3D): RenderStats {
    this.setHighlighted(null);
    this.clear();
    applyDefaultDisplayMaterials(object);

    const box = new THREE.Box3().setFromObject(object);
    const hasGeometryBounds = !box.isEmpty();
    const size = hasGeometryBounds ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
    const center = hasGeometryBounds ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const extent = Math.max(size.x, size.y, size.z, 1);
    const wrapper = new THREE.Group();
    wrapper.add(object);
    object.position.sub(center);
    wrapper.scale.setScalar(1 / extent);

    this.activeObject = wrapper;
    this.scene.add(wrapper);
    this.resetCamera();
    return countObjectGeometry(object);
  }

  frameModel(): void {
    const frame = this.getCameraFrame();
    const direction = this.camera.position.clone().sub(this.controls.target);
    this.applyCameraFrame(frame, direction.lengthSq() > 0 ? direction : ISOMETRIC_DIRECTION);
  }

  resetCamera(): void {
    this.applyCameraFrame(this.getCameraFrame(), ISOMETRIC_DIRECTION);
  }

  clear(): void {
    if (!this.activeObject) return;
    this.setHighlighted(null);
    this.scene.remove(this.activeObject);
    disposeObjectResources(this.activeObject);
    this.activeObject = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver.disconnect();
    this.setSelectionHandler(null);
    this.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
    this.canvas.removeEventListener('pointerup', this.pointerUpHandler);
    this.canvas.removeEventListener('pointerleave', this.pointerLeaveHandler);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.highlightMaterial.dispose();
  }

  private resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private getCameraFrame(): CameraFrame {
    const box = new THREE.Box3();
    if (this.activeObject) box.setFromObject(this.activeObject);
    if (box.isEmpty()) return { target: new THREE.Vector3(), distance: 3 };
    return this.frameFor(box);
  }

  private frameFor(box: THREE.Box3): CameraFrame {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const verticalDistance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const horizontalDistance = verticalDistance / Math.max(this.camera.aspect, 0.75);
    return { target: sphere.center, distance: Math.max(verticalDistance, horizontalDistance, 1) * 1.24 };
  }

  private pickAt(ndcX: number, ndcY: number): THREE.Object3D | null {
    if (!this.activeObject) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    for (const hit of this.raycaster.intersectObject(this.activeObject, true)) {
      if (isEffectivelyVisible(hit.object)) return hit.object;
    }
    return null;
  }

  private restoreHighlight(): void {
    for (const { mesh, material } of this.highlightSwaps) {
      mesh.material = material;
    }
    this.highlightSwaps = [];
  }

  private applyCameraFrame(frame: CameraFrame, direction: THREE.Vector3): void {
    this.controls.target.copy(frame.target);
    this.camera.position.copy(frame.target).addScaledVector(direction.normalize(), frame.distance);
    this.camera.near = Math.max(frame.distance / 100, 0.01);
    this.camera.far = Math.max(frame.distance * 100, 100);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private renderLoop(): void {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(() => this.renderLoop());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

function countObjectGeometry(object: THREE.Object3D): RenderStats {
  let vertices = 0;
  let triangles = 0;
  object.traverse((node) => {
    if (!isRenderableMesh(node)) return;
    const position = node.geometry.getAttribute('position');
    if (!position) return;

    vertices += position.count;
    triangles += (node.geometry.index?.count ?? position.count) / 3;
  });
  return { vertices, triangles };
}

function disposeObjectResources(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  object.traverse((node) => {
    if (!isRenderableMesh(node)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function isRenderableMesh(node: THREE.Object3D): node is THREE.Mesh {
  return (node as THREE.Object3D & { isMesh?: boolean }).isMesh === true;
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function applyDefaultDisplayMaterials(object: THREE.Object3D): void {
  const clones = new Map<THREE.Material, THREE.Material>();

  object.traverse((node) => {
    if (!isRenderableMesh(node)) return;
    const hasVertexColors = node.geometry.getAttribute('color') !== undefined;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const displayMaterials = materials.map((material) => {
      if (!needsDefaultColor(material, hasVertexColors)) return material;
      const existing = clones.get(material);
      if (existing) return existing;

      const clone = material.clone();
      setMaterialColor(clone, DEFAULT_MODEL_COLOR);
      clones.set(material, clone);
      return clone;
    });
    node.material = Array.isArray(node.material) ? displayMaterials : displayMaterials[0];
  });

  if (clones.size === 0) return;
  const attachedMaterials = new Set<THREE.Material>();
  object.traverse((node) => {
    if (!isRenderableMesh(node)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      attachedMaterials.add(material);
    }
  });
  for (const source of clones.keys()) {
    if (!attachedMaterials.has(source)) source.dispose();
  }
}

function needsDefaultColor(material: THREE.Material, hasVertexColors: boolean): boolean {
  if (hasVertexColors) return false;
  const candidate = material as THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
  };
  if (!candidate.color || candidate.map) return false;
  // The preview exporter uses neutral gray for RVM nodes without an explicit
  // material color. Keep authored chromatic colors intact.
  return candidate.color.getHex() === 0xffffff || candidate.color.getHex() === 0xa9a9a9;
}

function setMaterialColor(material: THREE.Material, color: number): void {
  const candidate = material as THREE.Material & {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
  };
  candidate.color?.setHex(color);
  if ('roughness' in candidate && typeof candidate.roughness === 'number') candidate.roughness = 0.78;
  if ('metalness' in candidate && typeof candidate.metalness === 'number') candidate.metalness = 0.05;
  material.needsUpdate = true;
}
