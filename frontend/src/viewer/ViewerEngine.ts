import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderStats } from '../protocol.js';

const BACKGROUND_COLOR = 0x101418;
const ISOMETRIC_DIRECTION = new THREE.Vector3(1.45, 1.1, 1.45).normalize();

interface CameraFrame {
  target: THREE.Vector3;
  distance: number;
}

export class ViewerEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly resizeHandler: () => void;
  private activeObject: THREE.Object3D | null = null;
  private frameId = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setClearColor(BACKGROUND_COLOR, 1);
    this.camera.position.set(1.6, 1.1, 1.9);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(3, 5, 4);
    this.scene.add(keyLight);

    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
    this.resetCamera();
    this.renderLoop();
  }

  setObject3D(object: THREE.Object3D): RenderStats {
    this.clear();

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
    this.scene.remove(this.activeObject);
    disposeObjectResources(this.activeObject);
    this.activeObject = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resizeHandler);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
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

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const verticalDistance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const horizontalDistance = verticalDistance / Math.max(this.camera.aspect, 0.75);
    return { target: sphere.center, distance: Math.max(verticalDistance, horizontalDistance, 1) * 1.24 };
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
