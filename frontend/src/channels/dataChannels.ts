import { CHANNEL, URL_PARAMS, type ChannelStatus, type DataChannel } from '../protocol.js';

export interface RvmFileData {
  bytes: ArrayBuffer;
  name: string;
}

export interface DataChannelHandlers {
  onRvmFile: (data: RvmFileData) => Promise<boolean>;
  onStatus: (source: DataChannel, status: ChannelStatus) => void;
  onError: (message: string) => void;
}

export function initDataChannels(handlers: DataChannelHandlers): () => void {
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

  const name = query.get(URL_PARAMS.NAME) ?? fileName;
  void loadWorkspaceRvm(file, name, handlers);
  return noOp;
}

async function loadWorkspaceRvm(url: string, name: string, handlers: DataChannelHandlers): Promise<void> {
  handlers.onStatus(CHANNEL.FILE, 'loading');
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    handlers.onStatus(CHANNEL.FILE, 'parsing');
    const handled = await handlers.onRvmFile({ bytes: await response.arrayBuffer(), name });
    if (!handled) handlers.onError('RVM 未能加载，请检查文件是否完整。');
  } catch (error) {
    handlers.onError(`RVM 文件拉取失败（${errorMessage(error)}）。AIDT 文件引用只能从聊天预览中打开。`);
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function noOp(): void {
  // URL 文件通道不需要注销监听器。
}
