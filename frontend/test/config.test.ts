import { describe, expect, it } from 'vitest';
import { getRuntimeConfig } from '../src/config.js';

describe('getRuntimeConfig', () => {
  it('uses configured title and file size', () => {
    expect(
      getRuntimeConfig({
        DEV: true,
        VITE_RVM_ENABLE_DEV_UI: 'true',
        VITE_RVM_VIEWER_TITLE: '  工业 RVM 查看器  ',
        VITE_RVM_MAX_LOCAL_FILE_MB: '12.5',
      })
    ).toEqual({ title: '工业 RVM 查看器', maxLocalFileBytes: 12.5 * 1024 * 1024, devUiEnabled: true });
  });

  it('keeps development UI disabled in production even when requested', () => {
    expect(getRuntimeConfig({ DEV: false, VITE_RVM_ENABLE_DEV_UI: 'true' }).devUiEnabled).toBe(false);
  });

  it.each(['false', 'unexpected'])('disables development UI for an explicit value: %s', (value) => {
    expect(getRuntimeConfig({ DEV: true, VITE_RVM_ENABLE_DEV_UI: value }).devUiEnabled).toBe(false);
  });

  it.each([undefined, '', '0', '-1', 'not-a-number'])('falls back for an invalid size: %s', (size) => {
    expect(getRuntimeConfig({ VITE_RVM_MAX_LOCAL_FILE_MB: size })).toEqual({
      title: 'RVM Viewer',
      maxLocalFileBytes: 100 * 1024 * 1024,
      devUiEnabled: false,
    });
  });
});
