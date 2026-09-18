import { CHANNEL, URL_PARAMS, type ChannelStatus, type DataChannel } from '../protocol.js';

export interface RvmFileData {
  bytes: ArrayBuffer;
  name: string;
  displayName?: string;
  attrs?: ArrayBuffer;
}

export interface DataChannelHandlers {
  onRvmFile: (data: RvmFileData) => Promise<boolean>;
  onStatus: (source: DataChannel, status: ChannelStatus) => void;
  onError: (message: string) => void;
}

export function initDataChannels(handlers: DataChannelHandlers): () => void {
  let active = true;
  const query = new URLSearchParams(window.location.search);
  const file = query.get(URL_PARAMS.FILE);
  if (!file) {
    handlers.onStatus(CHANNEL.NONE, 'empty');
    return noOp;
  }

  const fileName = fileNameFromUrl(file);
  if (!isRvmFile(fileName)) {
    handlers.onError(`仅支持 .rvm 文件，收到：${fileName}`);
    return noOp;
  }

  const attrs = query.get(URL_PARAMS.ATTRS);
  if (attrs && !isAttributesFile(fileNameFromUrl(attrs))) {
    handlers.onError(`属性文件仅支持 .att、.attrib 或 .txt，收到：${fileNameFromUrl(attrs)}`);
    return noOp;
  }

  const displayName = query.get(URL_PARAMS.NAME)?.trim() || fileName;
  void loadWorkspaceRvm(file, attrs, fileName, displayName, handlers, () => active);
  return () => {
    active = false;
  };
}

async function loadWorkspaceRvm(
  url: string,
  attrsUrl: string | null,
  name: string,
  displayName: string,
  handlers: DataChannelHandlers,
  isActive: () => boolean
): Promise<void> {
  handlers.onStatus(CHANNEL.FILE, 'loading');
  try {
    const [bytes, attrs] = await Promise.all([
      fetchBytes(url, 'RVM'),
      attrsUrl ? fetchBytes(attrsUrl, '属性') : Promise.resolve(undefined),
    ]);

    if (!isActive()) return;
    handlers.onStatus(CHANNEL.FILE, 'parsing');
    const handled = await handlers.onRvmFile({
      bytes,
      name,
      ...(displayName !== name ? { displayName } : {}),
      ...(attrs ? { attrs } : {}),
    });
    if (isActive() && !handled) handlers.onError('RVM 未能加载，请检查文件是否完整。');
  } catch (error) {
    if (isActive())
      handlers.onError(`模型文件拉取失败（${errorMessage(error)}）。AIDT 文件引用只能从聊天预览中打开。`);
  }
}

async function fetchBytes(url: string, label: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  return response.arrayBuffer();
}

function fileNameFromUrl(value: string): string {
  try {
    const path = new URL(value, window.location.href).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || 'model.rvm';
  } catch {
    return value;
  }
}

function isRvmFile(name: string): boolean {
  return name.toLowerCase().endsWith('.rvm');
}

function isAttributesFile(name: string): boolean {
  return /\.(att|attrib|txt)$/i.test(name);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function noOp(): void {
  // URL 文件通道不需要注销监听器。
}
