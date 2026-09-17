import * as THREE from 'three';
import type { GeometryData } from '../protocol.js';

export function demoGeometry(): GeometryData {
  const geometry = new THREE.TorusKnotGeometry(1, 0.28, 96, 24).toNonIndexed();
  const position = geometry.getAttribute('position');
  const pos = Array.from(position.array);
  const tris = Array.from({ length: pos.length / 3 }, (_, index) => index);
  geometry.dispose();

  return { name: '演示模型（torus knot）', format: 'DEMO', pos, tris };
}
