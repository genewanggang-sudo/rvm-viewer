import { describe, expect, it } from 'vitest';
import { readLocalRvm } from '../src/viewer/localModel.js';

function fakeFile(name: string, bytes: ArrayBuffer): File {
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes } as unknown as File;
}

describe('readLocalRvm', () => {
  it('reads one RVM file and preserves its name', async () => {
    const bytes = new ArrayBuffer(8);
    await expect(readLocalRvm(fakeFile('PLANT.RVM', bytes), 10)).resolves.toEqual({
      bytes,
      name: 'PLANT.RVM',
    });
  });

  it('rejects empty, oversized, and non-RVM files', async () => {
    await expect(readLocalRvm(fakeFile('empty.rvm', new ArrayBuffer(0)), 10)).rejects.toThrow('为空');
    await expect(readLocalRvm(fakeFile('large.rvm', new ArrayBuffer(11)), 10)).rejects.toThrow('超过');
    await expect(readLocalRvm(fakeFile('model.stl', new ArrayBuffer(1)), 10)).rejects.toThrow('仅支持');
  });
});
