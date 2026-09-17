export interface RuntimeConfig {
  title: string;
  enableLocalUpload: boolean;
  maxLocalFileBytes: number;
}

const DEFAULT_MAX_LOCAL_FILE_MB = 100;

export function getRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  const title = env.VITE_RVM_VIEWER_TITLE?.trim() || 'RVM Viewer';
  const maxMegabytes = toPositiveNumber(env.VITE_RVM_MAX_LOCAL_FILE_MB, DEFAULT_MAX_LOCAL_FILE_MB);

  return {
    title,
    enableLocalUpload: env.VITE_RVM_ENABLE_LOCAL_UPLOAD !== 'false',
    maxLocalFileBytes: maxMegabytes * 1024 * 1024,
  };
}

function toPositiveNumber(value: string | undefined, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

export const runtimeConfig = getRuntimeConfig(import.meta.env);
