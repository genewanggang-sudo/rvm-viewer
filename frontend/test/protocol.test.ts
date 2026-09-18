import { describe, expect, it } from 'vitest';
import { CHANNEL, MSG, PROTOCOL_VERSION, URL_PARAMS } from '../src/protocol.js';

describe('RVM protocol constants', () => {
  it('exposes only the RVM file contract', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(MSG).toEqual({ RENDERED: 'rvm-viewer:rendered' });
    expect(URL_PARAMS).toEqual({ FILE: 'file', ATTRS: 'attrs', NAME: 'name', EMBED: 'embed' });
    expect(CHANNEL).toEqual({
      FILE: 'AIDT 工作区文件',
      LOCAL: '本地选择文件',
      TEST: '本地测试模型',
      NONE: '请选择一个 RVM 文件',
    });
  });
});
