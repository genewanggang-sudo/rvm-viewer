import { describe, expect, it } from 'vitest';
import { MSG, PROTOCOL_VERSION, isValidGeometryPayload } from '../src/protocol.js';

const valid = {
  v: PROTOCOL_VERSION,
  type: MSG.GEOMETRY,
  pos: [0, 0, 0],
  tris: [0, 0, 0],
};

describe('isValidGeometryPayload', () => {
  it('accepts a complete finite payload', () => {
    expect(isValidGeometryPayload(valid)).toBe(true);
  });

  it.each([
    null,
    'geometry',
    { ...valid, v: 2 },
    { ...valid, type: 'other' },
    { ...valid, pos: [] },
    { ...valid, pos: [0, 0] },
    { ...valid, pos: [0, Number.NaN, 0] },
    { ...valid, tris: [] },
    { ...valid, tris: [0, 0] },
    { ...valid, tris: [0, 0, 0.5] },
  ])('rejects invalid data %#', (candidate) => {
    expect(isValidGeometryPayload(candidate)).toBe(false);
  });
});
