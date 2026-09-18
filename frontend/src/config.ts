export interface RuntimeConfig {
  title: string;
  maxLocalFileBytes: number;
  testModelEnabled: boolean;
}

const DEFAULT_MAX_LOCAL_FILE_MB = 100;

interface RuntimeEnvironment {
  DEV?: boolean;
  VITE_RVM_VIEWER_TITLE?: string;
  VITE_RVM_MAX_LOCAL_FILE_MB?: string;
}

export function getRuntimeConfig(env: RuntimeEnvironment): RuntimeConfig {
  const title = env.VITE_RVM_VIEWER_TITLE?.trim() || 'RVM Viewer';
  const maxMegabytes = toPositiveNumber(env.VITE_RVM_MAX_LOCAL_FILE_MB, DEFAULT_MAX_LOCAL_FILE_MB);

  return {
    title,
    maxLocalFileBytes: maxMegabytes * 1024 * 1024,
    testModelEnabled: env.DEV === true,
  };
}

function toPositiveNumber(value: string | undefined, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

export const runtimeConfig = getRuntimeConfig(import.meta.env);
