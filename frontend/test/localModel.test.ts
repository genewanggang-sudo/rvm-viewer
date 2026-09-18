import { describe, expect, it } from 'vitest';
import { LOCAL_ATTRIBUTES_ACCEPT, LOCAL_RVM_ACCEPT, readLocalRvm } from '../src/viewer/localModel.js';

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
    expect(LOCAL_RVM_ACCEPT).toBe('.rvm');
    expect(LOCAL_ATTRIBUTES_ACCEPT).toBe('.att,.attrib,.txt');
  });

  it.each(['plant.att', 'plant.attrib', 'plant.txt'])('reads supported %s attributes', async (name) => {
    const model = new ArrayBuffer(8);
    const attrs = new ArrayBuffer(4);
    await expect(readLocalRvm(fakeFile('plant.rvm', model), 10, fakeFile(name, attrs))).resolves.toEqual({
      bytes: model,
      name: 'plant.rvm',
      attrs,
    });
  });

  it('rejects empty, oversized, and non-RVM files', async () => {
    await expect(readLocalRvm(fakeFile('empty.rvm', new ArrayBuffer(0)), 10)).rejects.toThrow('为空');
    await expect(readLocalRvm(fakeFile('large.rvm', new ArrayBuffer(11)), 10)).rejects.toThrow('超过');
    await expect(readLocalRvm(fakeFile('model.stl', new ArrayBuffer(1)), 10)).rejects.toThrow('仅支持');
    await expect(
      readLocalRvm(fakeFile('model.rvm', new ArrayBuffer(1)), 10, fakeFile('empty.txt', new ArrayBuffer(0)))
    ).rejects.toThrow('属性文件为空');
    await expect(
      readLocalRvm(fakeFile('model.rvm', new ArrayBuffer(1)), 10, fakeFile('large.txt', new ArrayBuffer(11)))
    ).rejects.toThrow('属性文件超过');
    await expect(
      readLocalRvm(fakeFile('model.rvm', new ArrayBuffer(1)), 10, fakeFile('attrs.csv', new ArrayBuffer(1)))
    ).rejects.toThrow('属性文件仅支持');
  });
});
