import { describe, expect, it } from 'vitest';
import { parseLocalModel, parseObj, parseStl } from '../src/viewer/localModel.js';

function fakeFile(name: string, bytes: ArrayBuffer, text = ''): File {
  return {
    name,
    size: bytes.byteLength,
    text: async () => text,
    arrayBuffer: async () => bytes,
  } as unknown as File;
}

function bufferFromText(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function binaryStl(triangleCount = 1): ArrayBuffer {
  const bytes = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(bytes);
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    offset += 12;
    for (let coordinate = 0; coordinate < 9; coordinate += 1) {
      view.setFloat32(offset, coordinate, true);
      offset += 4;
    }
    offset += 2;
  }
  return bytes;
}

describe('local model parsers', () => {
  it('parses OBJ vertices, negative indexes, and polygons', () => {
    const parsed = parseObj('\n# a comment\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf -4 -3 -2 -1', 'quad.obj');
    expect(parsed).toEqual({
      name: 'quad.obj',
      format: 'OBJ',
      pos: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      tris: [0, 1, 2, 0, 2, 3],
    });
  });

  it.each(['v 0 xx 0', 'f 1 2', 'v 0 0 0\nf 2 2 2', 'v 0 0 0\nf 0 0 0', 'v 0 0 0'])(
    'reports malformed OBJ',
    (source) => {
      expect(() => parseObj(source)).toThrow();
    }
  );

  it('parses ASCII and binary STL', () => {
    const ascii =
      'solid sample\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid';
    expect(parseStl(bufferFromText(ascii), 'ascii.stl')).toMatchObject({
      format: 'STL',
      pos: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    });
    expect(parseStl(binaryStl(), 'binary.stl')).toMatchObject({ format: 'STL', tris: [0, 1, 2] });
  });

  it.each([
    [bufferFromText('solid bad endsolid'), 'ASCII STL'],
    [new ArrayBuffer(10), '二进制 STL'],
    [
      (() => {
        const buffer = binaryStl();
        new DataView(buffer).setUint32(80, 2, true);
        return buffer;
      })(),
      '二进制 STL',
    ],
  ])('rejects malformed STL', (buffer, label) => {
    expect(() => parseStl(buffer as ArrayBuffer)).toThrow(label);
  });

  it('rejects binary STL with NaN values or no triangles', () => {
    const nan = binaryStl();
    new DataView(nan).setFloat32(96, Number.NaN, true);
    expect(() => parseStl(nan)).toThrow('无效坐标');
    expect(() => parseStl(binaryStl(0))).toThrow('未找到三角面');
  });

  it('routes supported local files and rejects size and extension problems', async () => {
    const obj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3';
    await expect(
      parseLocalModel(fakeFile('shape.obj', bufferFromText(obj), obj), 1024)
    ).resolves.toMatchObject({ kind: 'geometry' });
    await expect(parseLocalModel(fakeFile('shape.stl', binaryStl()), 1024)).resolves.toMatchObject({
      kind: 'geometry',
    });
    await expect(parseLocalModel(fakeFile('plant.rvm', new ArrayBuffer(5)), 1024)).resolves.toMatchObject({
      kind: 'rvm',
      name: 'plant.rvm',
    });
    await expect(parseLocalModel(fakeFile('shape.ifc', new ArrayBuffer(1)), 1024)).rejects.toThrow('不支持');
    await expect(parseLocalModel(fakeFile('noextension', new ArrayBuffer(1)), 1024)).rejects.toThrow(
      '无扩展名'
    );
    await expect(parseLocalModel(fakeFile('empty.obj', new ArrayBuffer(0)), 1024)).rejects.toThrow('为空');
    await expect(parseLocalModel(fakeFile('large.rvm', new ArrayBuffer(8)), 4)).rejects.toThrow('超过');
  });
});
