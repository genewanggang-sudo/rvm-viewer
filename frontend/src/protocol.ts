export const PROTOCOL_VERSION = 1 as const;

export const MSG = {
  GEOMETRY: 'rvm-viewer:geometry',
  READY: 'rvm-viewer:ready',
  RENDERED: 'rvm-viewer:rendered',
} as const;

export const URL_PARAMS = {
  PAYLOAD: 'payload',
  FILE: 'file',
  ATT: 'att',
  NAME: 'name',
  DEMO: 'demo',
  EMBED: 'embed',
} as const;

export const CHANNEL = {
  PAYLOAD: 'URL payload',
  FILE: '工作区文件 fetch',
  POSTMESSAGE: 'postMessage 注入',
  DEMO: '内置演示（?demo=1）',
  LOCAL: '本地手动上传',
  NONE: '未指定数据（可上传文件或使用 ?demo=1）',
} as const;

export type DataChannel = (typeof CHANNEL)[keyof typeof CHANNEL];
export type ChannelStatus = 'loading' | 'waiting' | 'parsing' | 'loaded' | 'empty';

export interface GeometryData {
  name?: string;
  format?: string;
  pos: number[];
  tris: number[];
}

export interface GeometryPayload extends GeometryData {
  v: typeof PROTOCOL_VERSION;
  type: typeof MSG.GEOMETRY;
}

export interface RenderStats {
  vertices: number;
  triangles: number;
}

export interface RenderedMessage extends RenderStats {
  v: typeof PROTOCOL_VERSION;
  type: typeof MSG.RENDERED;
  name: string;
}

export interface ReadyMessage {
  v: typeof PROTOCOL_VERSION;
  type: typeof MSG.READY;
}

export function isValidGeometryPayload(value: unknown): value is GeometryPayload {
  if (!isRecord(value)) return false;

  return (
    value.v === PROTOCOL_VERSION &&
    value.type === MSG.GEOMETRY &&
    isFiniteNumberArray(value.pos, true) &&
    value.pos.length % 3 === 0 &&
    isFiniteNumberArray(value.tris, true) &&
    value.tris.length % 3 === 0 &&
    value.tris.every(Number.isSafeInteger)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumberArray(value: unknown, requireValue: boolean): value is number[] {
  if (!isUnknownArray(value) || (requireValue && value.length === 0)) return false;
  return value.every((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function isUnknownArray(value: unknown): value is unknown[] {
  return value instanceof Array;
}
