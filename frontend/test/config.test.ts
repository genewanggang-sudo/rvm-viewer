import { describe, expect, it } from 'vitest';
import { getRuntimeConfig } from '../src/config.js';

describe('getRuntimeConfig', () => {
  it('uses configured title and file size', () => {
    expect(
      getRuntimeConfig({
        DEV: true,
        VITE_RVM_VIEWER_TITLE: '  工业 RVM 查看器  ',
        VITE_RVM_MAX_LOCAL_FILE_MB: '12.5',
      })
    ).toEqual({ title: '工业 RVM 查看器', maxLocalFileBytes: 12.5 * 1024 * 1024, testModelEnabled: true });
  });

  it.each([undefined, '', '0', '-1', 'not-a-number'])('falls back for an invalid size: %s', (size) => {
    expect(getRuntimeConfig({ VITE_RVM_MAX_LOCAL_FILE_MB: size })).toEqual({
      title: 'RVM Viewer',
      maxLocalFileBytes: 100 * 1024 * 1024,
      testModelEnabled: false,
    });
  });
});
