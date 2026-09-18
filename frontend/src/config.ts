export interface RuntimeConfig {
  title: string;
  maxLocalFileBytes: number;
  devUiEnabled: boolean;
}

const DEFAULT_MAX_LOCAL_FILE_MB = 100;

interface RuntimeEnvironment {
  DEV?: boolean;
  VITE_RVM_ENABLE_DEV_UI?: string;
  VITE_RVM_VIEWER_TITLE?: string;
  VITE_RVM_MAX_LOCAL_FILE_MB?: string;
}

export function getRuntimeConfig(env: RuntimeEnvironment): RuntimeConfig {
  const title = env.VITE_RVM_VIEWER_TITLE?.trim() || 'RVM Viewer';
  const maxMegabytes = toPositiveNumber(env.VITE_RVM_MAX_LOCAL_FILE_MB, DEFAULT_MAX_LOCAL_FILE_MB);

  return {
    title,
    maxLocalFileBytes: maxMegabytes * 1024 * 1024,
    devUiEnabled: env.DEV === true && readBoolean(env.VITE_RVM_ENABLE_DEV_UI, true),
  };
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

function toPositiveNumber(value: string | undefined, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

export const runtimeConfig = getRuntimeConfig(import.meta.env);
