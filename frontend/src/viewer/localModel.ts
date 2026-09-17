import type { GeometryData } from '../protocol.js';

export const LOCAL_MODEL_ACCEPT = '.obj,.stl,.rvm';
export const LOCAL_ATTRIBUTE_ACCEPT = '.att,.txt';

export type ParsedLocalModel =
  { kind: 'geometry'; data: GeometryData } | { kind: 'rvm'; bytes: ArrayBuffer; name: string };

export async function parseLocalModel(file: File, maxBytes: number): Promise<ParsedLocalModel> {
  if (file.size === 0) throw new Error('模型文件为空');
  if (file.size > maxBytes)
    throw new Error(`模型文件超过 ${(maxBytes / 1024 / 1024).toFixed(0)} MB 本地限制`);

  const extension = getExtension(file.name);
  switch (extension) {
    case 'obj':
      return { kind: 'geometry', data: parseObj(await file.text(), file.name) };
    case 'stl':
      return { kind: 'geometry', data: parseStl(await file.arrayBuffer(), file.name) };
    case 'rvm':
      return { kind: 'rvm', bytes: await file.arrayBuffer(), name: file.name };
    default:
      throw new Error(`不支持 ${extension ? `.${extension}` : '无扩展名'} 文件；请选择 OBJ、STL 或 RVM`);
  }
}

export function parseObj(text: string, name = 'model.obj'): GeometryData {
  const pos: number[] = [];
  const tris: number[] = [];
  const lines = text.split(/\r?\n/);

  for (const [lineIndex, line] of lines.entries()) {
    const tokens = line.trim().split(/\s+/);
    const tag = tokens[0];
    if (tag === '' || tag === '#') continue;

    if (tag === 'v') {
      const values = tokens.slice(1, 4).map(Number);
      if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
        throw new Error(`OBJ 第 ${lineIndex + 1} 行顶点坐标无效`);
      }
      pos.push(values[0], values[1], values[2]);
      continue;
    }

    if (tag === 'f') {
      if (tokens.length < 4) throw new Error(`OBJ 第 ${lineIndex + 1} 行面至少需要 3 个顶点`);
      const face = tokens.slice(1).map((token) => parseObjIndex(token, pos.length / 3, lineIndex));
      for (let index = 1; index + 1 < face.length; index += 1) {
        const first = face[0];
        const current = face[index];
        const next = face[index + 1];
        tris.push(first, current, next);
      }
    }
  }

  if (pos.length === 0 || tris.length === 0) throw new Error('OBJ 中未找到有效的顶点和三角面');
  return { name, format: 'OBJ', pos, tris };
}

export function parseStl(buffer: ArrayBuffer, name = 'model.stl'): GeometryData {
  const bytes = new Uint8Array(buffer);
  const header = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 200)));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const looksAscii = /^\s*solid\b/i.test(header) && /endsolid/i.test(text);

  if (looksAscii) {
    const values = Array.from(text.matchAll(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g)).flatMap(
      (match) => [match[1], match[2], match[3]].map(Number)
    );
    if (values.length === 0 || values.length % 9 !== 0 || values.some((value) => !Number.isFinite(value))) {
      throw new Error('ASCII STL 顶点数据无效');
    }
    return createExpandedStlGeometry(values, name);
  }

  if (buffer.byteLength < 84) throw new Error('二进制 STL 文件过短');
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const expectedBytes = 84 + triangleCount * 50;
  if (buffer.byteLength < expectedBytes) throw new Error('二进制 STL 文件长度与三角面数不匹配');

  const pos: number[] = [];
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    offset += 12;
    for (let coordinate = 0; coordinate < 9; coordinate += 1) {
      const value = view.getFloat32(offset, true);
      if (!Number.isFinite(value)) throw new Error('二进制 STL 含无效坐标');
      pos.push(value);
      offset += 4;
    }
    offset += 2;
  }

  if (pos.length === 0) throw new Error('STL 中未找到三角面');
  return createExpandedStlGeometry(pos, name);
}

function parseObjIndex(token: string, vertexCount: number, lineIndex: number): number {
  const raw = Number.parseInt(token.split('/')[0], 10);
  if (!Number.isSafeInteger(raw) || raw === 0) throw new Error(`OBJ 第 ${lineIndex + 1} 行面索引无效`);

  const index = raw > 0 ? raw - 1 : vertexCount + raw;
  if (index < 0 || index >= vertexCount) throw new Error(`OBJ 第 ${lineIndex + 1} 行面索引越界`);
  return index;
}

function createExpandedStlGeometry(pos: number[], name: string): GeometryData {
  const tris = Array.from({ length: pos.length / 3 }, (_, index) => index);
  return { name, format: 'STL', pos, tris };
}

function getExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}
