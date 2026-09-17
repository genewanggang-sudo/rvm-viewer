import { expect, it } from 'vitest';
import { demoGeometry } from '../src/viewer/demoGeometry.js';

it('creates indexed demo geometry data', () => {
  const geometry = demoGeometry();
  expect(geometry).toMatchObject({ format: 'DEMO' });
  expect(geometry.pos.length).toBeGreaterThan(0);
  expect(geometry.pos.length % 3).toBe(0);
  expect(geometry.tris).toHaveLength(geometry.pos.length / 3);
});
