import * as THREE from 'three';
import type { RenderStats } from '../protocol.js';

export interface BuiltGeometry extends RenderStats {
  geometry: THREE.BufferGeometry;
}

interface NormalizedPositions extends RenderStats {
  positions: Float32Array;
}

export function buildNormalizedPositions(
  pos: readonly number[],
  tris: readonly number[]
): NormalizedPositions | null {
  if (pos.length === 0 || pos.length % 3 !== 0 || tris.length === 0 || tris.length % 3 !== 0) {
    return null;
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let offset = 0; offset < pos.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = pos[offset + axis];
      if (!Number.isFinite(value)) return null;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);
  const positions = new Float32Array(tris.length * 3);

  for (let indexOffset = 0; indexOffset < tris.length; indexOffset += 1) {
    const vertexIndex = tris[indexOffset];
    if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0) return null;

    const vertexOffset = vertexIndex * 3;
    if (vertexOffset + 2 >= pos.length) return null;

    for (let axis = 0; axis < 3; axis += 1) {
      const coordinate = pos[vertexOffset + axis];
      const origin = center[axis];
      positions[indexOffset * 3 + axis] = (coordinate - origin) / extent;
    }
  }

  return { positions, vertices: pos.length / 3, triangles: tris.length / 3 };
}

export function buildGeometry(pos: readonly number[], tris: readonly number[]): BuiltGeometry | null {
  const normalized = buildNormalizedPositions(pos, tris);
  if (!normalized) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(normalized.positions, 3));
  geometry.computeVertexNormals();

  return { geometry, vertices: normalized.vertices, triangles: normalized.triangles };
}
