import {
  CHANNEL,
  MSG,
  PROTOCOL_VERSION,
  URL_PARAMS,
  isValidGeometryPayload,
  type ChannelStatus,
  type DataChannel,
  type GeometryData,
  type RenderStats,
} from '../protocol.js';
import { demoGeometry } from '../viewer/demoGeometry.js';

export interface FileBufferData {
  bytes: ArrayBuffer;
  attrs?: ArrayBuffer;
  name?: string;
}

export interface DataChannelHandlers {
  onGeometry: (data: GeometryData) => RenderStats | null;
  onFileBuffer?: (data: FileBufferData) => Promise<boolean>;
  onStatus: (source: DataChannel, status: ChannelStatus) => void;
  onError: (message: string) => void;
}

export function initDataChannels(handlers: DataChannelHandlers): () => void {
  const query = new URLSearchParams(window.location.search);
  const deliver = (data: GeometryData): RenderStats | null => {
    const stats = handlers.onGeometry(data);
    if (stats) acknowledgeRender(data.name ?? '-', stats);
    return stats;
  };

  const payload = query.get(URL_PARAMS.PAYLOAD);
  if (payload) {
    try {
      const parsed: unknown = JSON.parse(decodeBase64Url(payload));
      if (!isValidGeometryPayload(parsed)) throw new Error('payload 结构不符合协议');

      handlers.onStatus(CHANNEL.PAYLOAD, 'loaded');
      deliver({
        name: query.get(URL_PARAMS.NAME) ?? parsed.name,
        format: parsed.format,
        pos: parsed.pos,
        tris: parsed.tris,
      });
    } catch (error) {
      handlers.onError(`payload 解析失败：${errorMessage(error)}`);
    }
    return noOp;
  }

  const file = query.get(URL_PARAMS.FILE);
  if (file) {
    void loadWorkspaceFile(
      file,
      query.get(URL_PARAMS.ATT),
      query.get(URL_PARAMS.NAME) ?? undefined,
      handlers,
      deliver
    );
    return noOp;
  }

  if (query.get(URL_PARAMS.DEMO) === '1') {
    handlers.onStatus(CHANNEL.DEMO, 'loaded');
    deliver(demoGeometry());
    return noOp;
  }

  return listenForPostMessage(handlers, deliver);
}

async function loadWorkspaceFile(
  file: string,
  attr: string | null,
  name: string | undefined,
  handlers: DataChannelHandlers,
  deliver: (data: GeometryData) => RenderStats | null
): Promise<void> {
  handlers.onStatus(CHANNEL.FILE, 'loading');
  try {
    const [fileBuffer, attrBuffer] = await Promise.all([
      fetchArrayBuffer(file),
      attr ? fetchOptionalArrayBuffer(attr) : undefined,
    ]);
    const geometry = parseGeometryJson(fileBuffer, name);
    if (geometry) {
      handlers.onStatus(CHANNEL.FILE, 'loaded');
      deliver(geometry);
      return;
    }

    handlers.onStatus(CHANNEL.FILE, 'parsing');
    const handled = await handlers.onFileBuffer?.({ bytes: fileBuffer, attrs: attrBuffer, name });
    if (!handled) {
      handlers.onError(`已获取文件 ${(fileBuffer.byteLength / 1024).toFixed(1)} KB，暂无对应解析器`);
    }
  } catch (error) {
    handlers.onError(
      `文件拉取失败（${errorMessage(error)}）。本交付件需从聊天预览打开：本地直接打开无法访问平台文件服务。`
    );
  }
}

function listenForPostMessage(
  handlers: DataChannelHandlers,
  deliver: (data: GeometryData) => RenderStats | null
): () => void {
  const embedded = window.parent !== window;
  if (embedded) {
    postToParent({ v: PROTOCOL_VERSION, type: MSG.READY });
    handlers.onStatus(CHANNEL.POSTMESSAGE, 'waiting');
  } else {
    handlers.onStatus(CHANNEL.NONE, 'empty');
  }

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (embedded && event.source !== window.parent) return;
    if (!isValidGeometryPayload(event.data)) return;

    handlers.onStatus(CHANNEL.POSTMESSAGE, 'loaded');
    deliver({ name: event.data.name, format: event.data.format, pos: event.data.pos, tris: event.data.tris });
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

function parseGeometryJson(buffer: ArrayBuffer, overrideName?: string): GeometryData | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!text.trimStart().startsWith('{')) return null;
    const parsed: unknown = JSON.parse(text);
    if (!isValidGeometryPayload(parsed)) return null;

    return { name: overrideName ?? parsed.name, format: parsed.format, pos: parsed.pos, tris: parsed.tris };
  } catch {
    return null;
  }
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function fetchOptionalArrayBuffer(url: string): Promise<ArrayBuffer | undefined> {
  const response = await fetch(url, { credentials: 'include' });
  return response.ok ? response.arrayBuffer() : undefined;
}

function acknowledgeRender(name: string, stats: RenderStats): void {
  postToParent({ v: PROTOCOL_VERSION, type: MSG.RENDERED, name, ...stats });
}

function postToParent(message: Record<string, unknown>): void {
  if (window.parent === window) return;
  try {
    window.parent.postMessage(message, '*');
  } catch {
    // iframe 父窗口不可用时，渲染本身仍可继续。
  }
}

function decodeBase64Url(value: string): string {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';

  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function noOp(): void {
  // URL 通道独占，不需要注销监听器。
}
