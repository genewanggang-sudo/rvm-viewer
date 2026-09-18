/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RVM_BASE_PATH?: string;
  readonly VITE_RVM_VIEWER_TITLE?: string;
  readonly VITE_RVM_ENABLE_DEV_UI?: string;
  readonly VITE_RVM_MAX_LOCAL_FILE_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
