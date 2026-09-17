import { describe, expect, it } from 'vitest';
import { buildGeometry, buildNormalizedPositions } from '../src/viewer/geometry.js';

const triangle = { pos: [0, 0, 0, 2, 0, 0, 0, 2, 0], tris: [0, 1, 2] };

describe('geometry', () => {
  it('normalizes and builds valid triangle geometry', () => {
    const normalized = buildNormalizedPositions(triangle.pos, triangle.tris);
    expect(normalized).toMatchObject({ vertices: 3, triangles: 1 });
    expect(Array.from(normalized?.positions ?? [])).toEqual([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0]);

    const built = buildGeometry(triangle.pos, triangle.tris);
    expect(built?.geometry.getAttribute('position').count).toBe(3);
    expect(built).toMatchObject({ vertices: 3, triangles: 1 });
    built?.geometry.dispose();
  });

  it.each([
    { pos: [], tris: [0, 0, 0] },
    { pos: [0, 0], tris: [0, 0, 0] },
    { pos: [0, 0, 0], tris: [] },
    { pos: [0, 0, 0], tris: [0, 0] },
    { pos: [0, Number.NaN, 0], tris: [0, 0, 0] },
    { pos: [0, 0, 0], tris: [-1, 0, 0] },
    { pos: [0, 0, 0], tris: [0.1, 0, 0] },
    { pos: [0, 0, 0], tris: [1, 0, 0] },
  ])('rejects invalid geometry %#', ({ pos, tris }) => {
    expect(buildNormalizedPositions(pos, tris)).toBeNull();
    expect(buildGeometry(pos, tris)).toBeNull();
  });

  it('rejects sparse coordinates and indexes', () => {
    const coordinates = [0, 0, 0];
    delete coordinates[1];
    const indexes = [0, 0, 0];
    delete indexes[0];
    expect(buildNormalizedPositions(coordinates, [0, 0, 0])).toBeNull();
    expect(buildNormalizedPositions([0, 0, 0], indexes)).toBeNull();
  });
});
