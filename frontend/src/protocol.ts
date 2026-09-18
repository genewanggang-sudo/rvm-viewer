export const PROTOCOL_VERSION = 1 as const;

export const MSG = {
  RENDERED: 'rvm-viewer:rendered',
} as const;

export const URL_PARAMS = {
  FILE: 'file',
  NAME: 'name',
  EMBED: 'embed',
} as const;

export const CHANNEL = {
  FILE: 'AIDT 工作区文件',
  LOCAL: '本地选择文件',
  TEST: '本地测试模型',
  NONE: '请选择一个 RVM 文件',
} as const;

export type DataChannel = (typeof CHANNEL)[keyof typeof CHANNEL];
export type ChannelStatus = 'loading' | 'parsing' | 'empty';

export interface RenderStats {
  vertices: number;
  triangles: number;
}

export interface RenderedMessage extends RenderStats {
  v: typeof PROTOCOL_VERSION;
  type: typeof MSG.RENDERED;
  name: string;
}
