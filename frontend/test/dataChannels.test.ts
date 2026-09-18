import { afterEach, describe, expect, it, vi } from 'vitest';
import { initDataChannels, type DataChannelHandlers } from '../src/channels/dataChannels.js';
import { CHANNEL } from '../src/protocol.js';

function bytes(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

function response(body: ArrayBuffer, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function handlers(overrides: Partial<DataChannelHandlers> = {}): DataChannelHandlers {
  return {
    onRvmFile: vi.fn().mockResolvedValue(true),
    onStatus: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

async function nextTask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('RVM file channel', () => {
  it('stays idle until a file URL is supplied', () => {
    const target = handlers();
    initDataChannels(target)();
    expect(target.onStatus).toHaveBeenCalledWith(CHANNEL.NONE, 'empty');
  });

  it('rejects non-RVM URLs before fetching', () => {
    window.history.replaceState({}, '', '/?file=/workspace/model.obj');
    const target = handlers();
    initDataChannels(target);
    expect(target.onError).toHaveBeenCalledWith('仅支持 .rvm 文件，收到：model.obj');
  });

  it('fetches an RVM, honors the display name, and reports parsing', async () => {
    window.history.replaceState({}, '', '/?file=/workspace/%E6%A8%A1%E5%9E%8B.rvm&name=plant.rvm');
    const fetch = vi.fn().mockResolvedValue(response(bytes('RVM')));
    vi.stubGlobal('fetch', fetch);
    const target = handlers();
    initDataChannels(target);
    await nextTask();

    expect(fetch).toHaveBeenCalledWith('/workspace/模型.rvm', { credentials: 'include' });
    expect(target.onStatus).toHaveBeenNthCalledWith(1, CHANNEL.FILE, 'loading');
    expect(target.onStatus).toHaveBeenNthCalledWith(2, CHANNEL.FILE, 'parsing');
    expect(target.onRvmFile).toHaveBeenCalledWith({ bytes: bytes('RVM'), name: 'plant.rvm' });
  });

  it('accepts a display name without an extension when the file URL is an RVM', async () => {
    window.history.replaceState(
      {},
      '',
      '/?file=/workspace/model.rvm&name=%E5%B7%A5%E5%8E%82%E6%A8%A1%E5%9E%8B'
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes('RVM'))));
    const target = handlers();
    initDataChannels(target);
    await nextTask();

    expect(target.onError).not.toHaveBeenCalled();
    expect(target.onRvmFile).toHaveBeenCalledWith({ bytes: bytes('RVM'), name: '工厂模型' });
  });

  it('derives a name from an absolute URL and reports unsupported parser results', async () => {
    window.history.replaceState({}, '', '/?file=https%3A%2F%2Ffiles.example%2Fspace%2Fremote.rvm');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes('RVM'))));
    const target = handlers({ onRvmFile: vi.fn().mockResolvedValue(false) });
    initDataChannels(target);
    await nextTask();
    expect(target.onRvmFile).toHaveBeenCalledWith({ bytes: bytes('RVM'), name: 'remote.rvm' });
    expect(target.onError).toHaveBeenCalledWith('RVM 未能加载，请检查文件是否完整。');
  });

  it('uses model.rvm when a file URL has no basename', async () => {
    window.history.replaceState({}, '', '/?file=/workspace/');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes('RVM'))));
    const target = handlers();
    initDataChannels(target);
    await nextTask();
    expect(target.onRvmFile).toHaveBeenCalledWith({ bytes: bytes('RVM'), name: 'model.rvm' });
  });

  it('reports HTTP, fetch, parser, and malformed URL failures', async () => {
    window.history.replaceState({}, '', '/?file=/workspace/missing.rvm');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new ArrayBuffer(0), 404)));
    const http = handlers();
    initDataChannels(http);
    await nextTask();
    expect(http.onError).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'));

    window.history.replaceState({}, '', '/?file=/workspace/error.rvm');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'));
    const offline = handlers();
    initDataChannels(offline);
    await nextTask();
    expect(offline.onError).toHaveBeenCalledWith(expect.stringContaining('offline'));

    window.history.replaceState({}, '', '/?file=/workspace/parser.rvm');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes('RVM'))));
    const parser = handlers({ onRvmFile: vi.fn().mockRejectedValue(new Error('bad parser')) });
    initDataChannels(parser);
    await nextTask();
    expect(parser.onError).toHaveBeenCalledWith(expect.stringContaining('bad parser'));

    window.history.replaceState({}, '', '/?file=http%3A%2F%2F%5Binvalid%2Fmodel.rvm');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes('RVM'))));
    const malformed = handlers();
    initDataChannels(malformed);
    await nextTask();
    expect(malformed.onRvmFile).toHaveBeenCalledWith({
      bytes: bytes('RVM'),
      name: 'http://[invalid/model.rvm',
    });
  });
});
