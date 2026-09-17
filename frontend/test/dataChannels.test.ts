import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL, MSG, PROTOCOL_VERSION, type GeometryData } from '../src/protocol.js';
import { initDataChannels, type DataChannelHandlers } from '../src/channels/dataChannels.js';

const geometry = {
  v: PROTOCOL_VERSION,
  type: MSG.GEOMETRY,
  name: 'cube.obj',
  format: 'OBJ',
  pos: [0, 0, 0],
  tris: [0, 0, 0],
};

const deliveredGeometry: GeometryData = {
  name: 'cube.obj',
  format: 'OBJ',
  pos: [0, 0, 0],
  tris: [0, 0, 0],
};

function createHandlers(overrides: Partial<DataChannelHandlers> = {}): DataChannelHandlers {
  return {
    onGeometry: vi.fn(() => ({ vertices: 1, triangles: 1 })),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onFileBuffer: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function payload(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function response(bytes: ArrayBuffer, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: vi.fn().mockResolvedValue(bytes),
  } as unknown as Response;
}

function bytes(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

async function nextTask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

function replaceParent(parent: WindowProxy): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'parent');
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  return () => {
    if (descriptor) Object.defineProperty(window, 'parent', descriptor);
    else Reflect.deleteProperty(window, 'parent');
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('data channel arbitration', () => {
  it('uses URL payload before other channels and returns a no-op cleanup', () => {
    window.history.replaceState({}, '', `/?payload=${payload(geometry)}&name=override.obj&demo=1`);
    const handlers = createHandlers();
    const cleanup = initDataChannels(handlers);
    cleanup();

    expect(handlers.onStatus).toHaveBeenCalledWith(CHANNEL.PAYLOAD, 'loaded');
    expect(handlers.onGeometry).toHaveBeenCalledWith({ ...deliveredGeometry, name: 'override.obj' });
  });

  it('keeps the payload name and skips acknowledgements when rendering rejects it', () => {
    window.history.replaceState({}, '', `/?payload=${payload(geometry)}`);
    const handlers = createHandlers({ onGeometry: vi.fn(() => null) });
    initDataChannels(handlers);
    expect(handlers.onGeometry).toHaveBeenCalledWith(deliveredGeometry);
  });

  it.each(['not-base64', payload({ ...geometry, v: 99 })])('reports invalid payloads', (value) => {
    window.history.replaceState({}, '', `/?payload=${value}`);
    const handlers = createHandlers();
    initDataChannels(handlers);
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('payload 解析失败'));
  });

  it('loads geometry JSON from a workspace file', async () => {
    window.history.replaceState({}, '', '/?file=/workspace/cube.json&name=remote.json');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes(JSON.stringify(geometry)))));
    const handlers = createHandlers();
    initDataChannels(handlers);
    await nextTask();

    expect(handlers.onStatus).toHaveBeenNthCalledWith(1, CHANNEL.FILE, 'loading');
    expect(handlers.onStatus).toHaveBeenLastCalledWith(CHANNEL.FILE, 'loaded');
    expect(handlers.onGeometry).toHaveBeenCalledWith({ ...deliveredGeometry, name: 'remote.json' });
  });

  it('forwards non-geometry files and optional attributes to the parser', async () => {
    window.history.replaceState(
      {},
      '',
      '/?file=/workspace/plant.rvm&att=/workspace/plant.att&name=plant.rvm'
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(bytes('RVM')))
      .mockResolvedValueOnce(response(bytes('ATT')));
    vi.stubGlobal('fetch', fetch);
    const handlers = createHandlers();
    initDataChannels(handlers);
    await nextTask();

    expect(handlers.onStatus).toHaveBeenLastCalledWith(CHANNEL.FILE, 'parsing');
    expect(handlers.onFileBuffer).toHaveBeenCalledWith({
      bytes: bytes('RVM'),
      attrs: bytes('ATT'),
      name: 'plant.rvm',
    });
  });

  it('forwards invalid JSON and unavailable optional attributes to the parser', async () => {
    window.history.replaceState({}, '', '/?file=/workspace/invalid.json&att=/workspace/missing.att');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(bytes('{not-json')))
      .mockResolvedValueOnce(response(new ArrayBuffer(0), 404));
    vi.stubGlobal('fetch', fetch);
    const handlers = createHandlers();
    initDataChannels(handlers);
    await nextTask();
    expect(handlers.onFileBuffer).toHaveBeenCalledWith({
      bytes: bytes('{not-json'),
      attrs: undefined,
      name: undefined,
    });
  });

  it('reports when a file has no parser and when the fetch fails', async () => {
    window.history.replaceState({}, '', '/?file=/workspace/unknown.bin');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes('BIN'))));
    const noParser = createHandlers({ onFileBuffer: vi.fn().mockResolvedValue(false) });
    initDataChannels(noParser);
    await nextTask();
    expect(noParser.onError).toHaveBeenCalledWith(expect.stringContaining('暂无对应解析器'));

    window.history.replaceState({}, '', '/?file=/workspace/missing.bin');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new ArrayBuffer(0), 404)));
    const missing = createHandlers();
    initDataChannels(missing);
    await nextTask();
    expect(missing.onError).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'));
  });

  it('renders the built-in demo when requested', () => {
    window.history.replaceState({}, '', '/?demo=1');
    const handlers = createHandlers();
    initDataChannels(handlers);
    expect(handlers.onStatus).toHaveBeenCalledWith(CHANNEL.DEMO, 'loaded');
    expect(handlers.onGeometry).toHaveBeenCalledWith(expect.objectContaining({ format: 'DEMO' }));
  });

  it('listens for postMessage in a top-level viewer and removes its listener', () => {
    const handlers = createHandlers();
    const cleanup = initDataChannels(handlers);
    expect(handlers.onStatus).toHaveBeenCalledWith(CHANNEL.NONE, 'empty');
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'invalid' } }));
    expect(handlers.onGeometry).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent('message', { data: geometry }));
    expect(handlers.onGeometry).toHaveBeenCalledWith(deliveredGeometry);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { v: PROTOCOL_VERSION, type: MSG.GEOMETRY, pos: [0, 0, 0], tris: [0, 0, 0] },
      })
    );

    cleanup();
    window.dispatchEvent(new MessageEvent('message', { data: geometry }));
    expect(handlers.onGeometry).toHaveBeenCalledTimes(2);
  });

  it('only accepts parent messages when embedded and emits handshake messages', () => {
    const postMessage = vi.fn();
    const restoreParent = replaceParent({ postMessage } as unknown as WindowProxy);
    const handlers = createHandlers();
    const cleanup = initDataChannels(handlers);

    expect(postMessage).toHaveBeenCalledWith({ v: PROTOCOL_VERSION, type: MSG.READY }, '*');
    window.dispatchEvent(new MessageEvent('message', { data: geometry, source: window }));
    expect(handlers.onGeometry).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent('message', { data: geometry, source: window.parent as unknown as MessageEventSource })
    );
    expect(handlers.onGeometry).toHaveBeenCalledWith(deliveredGeometry);
    expect(postMessage).toHaveBeenLastCalledWith(
      { v: PROTOCOL_VERSION, type: MSG.RENDERED, name: 'cube.obj', vertices: 1, triangles: 1 },
      '*'
    );

    cleanup();
    restoreParent();
  });

  it('tolerates an unavailable parent while acknowledging embedded geometry', () => {
    const restoreParent = replaceParent({
      postMessage: () => {
        throw new Error('gone');
      },
    } as unknown as WindowProxy);
    const handlers = createHandlers();
    initDataChannels(handlers);
    window.dispatchEvent(
      new MessageEvent('message', { data: geometry, source: window.parent as unknown as MessageEventSource })
    );
    expect(handlers.onGeometry).toHaveBeenCalled();
    restoreParent();
  });

  it('stringifies non-Error failures from a payload renderer', () => {
    window.history.replaceState({}, '', `/?payload=${payload(geometry)}`);
    const handlers = createHandlers({
      onGeometry: vi.fn(() => {
        throw 'render failed';
      }),
    });
    initDataChannels(handlers);
    expect(handlers.onError).toHaveBeenCalledWith('payload 解析失败：render failed');
  });

  it('passes a valid JSON geometry without an override name and rejects invalid JSON geometry', async () => {
    window.history.replaceState({}, '', '/?file=/workspace/model.json');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(bytes(JSON.stringify(geometry)))));
    const valid = createHandlers();
    initDataChannels(valid);
    await nextTask();
    expect(valid.onGeometry).toHaveBeenCalledWith(deliveredGeometry);

    window.history.replaceState({}, '', '/?file=/workspace/invalid-geometry.json');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(bytes('{"not":"geometry"}'))));
    const invalid = createHandlers();
    initDataChannels(invalid);
    await nextTask();
    expect(invalid.onFileBuffer).toHaveBeenCalled();
  });
});
