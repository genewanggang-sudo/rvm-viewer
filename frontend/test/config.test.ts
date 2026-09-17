import { describe, expect, it } from 'vitest';
import { getRuntimeConfig } from '../src/config.js';

describe('getRuntimeConfig', () => {
  it('uses configured values', () => {
    expect(
      getRuntimeConfig({
        VITE_RVM_VIEWER_TITLE: '  工业查看器  ',
        VITE_RVM_ENABLE_LOCAL_UPLOAD: 'false',
        VITE_RVM_MAX_LOCAL_FILE_MB: '12.5',
      })
    ).toEqual({ title: '工业查看器', enableLocalUpload: false, maxLocalFileBytes: 12.5 * 1024 * 1024 });
  });

  it.each([undefined, '', '0', '-1', 'not-a-number'])('falls back for an invalid size: %s', (size) => {
    expect(getRuntimeConfig({ VITE_RVM_MAX_LOCAL_FILE_MB: size }).maxLocalFileBytes).toBe(100 * 1024 * 1024);
  });
});
