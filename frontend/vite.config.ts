import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const testFiles = [
  {
    route: '/__rvm-testdata/WD1-PSUP.RVM',
    path: fileURLToPath(new URL('../tmp/testdata/WD1-PSUP.RVM', import.meta.url)),
  },
  {
    route: '/__rvm-testdata/WD1-PSUP.txt',
    path: fileURLToPath(new URL('../tmp/testdata/WD1-PSUP.txt', import.meta.url)),
  },
] as const;

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devUiEnabled = command === 'serve' && readBoolean(env.VITE_RVM_ENABLE_DEV_UI, mode === 'development');
  const plugins: PluginOption[] = [react()];

  if (devUiEnabled) {
    plugins.push({
      name: 'serve-local-rvm-test-model',
      configureServer(server) {
        for (const file of testFiles) {
          server.middlewares.use(file.route, (_request, response, next) => {
            if (!existsSync(file.path)) return next();
            response.setHeader('Content-Type', 'application/octet-stream');
            createReadStream(file.path).on('error', next).pipe(response);
          });
        }
      },
    });
  }

  return {
    plugins,
    base: normalizeBasePath(env.VITE_RVM_BASE_PATH, mode === 'production' ? '/sample/rvm-viewer/' : '/'),
    server: { port: 5173, host: '127.0.0.1', strictPort: true },
    preview: { port: 5173, host: '127.0.0.1', strictPort: true },
    build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
  };
});

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

function normalizeBasePath(value: string | undefined, fallback: string): string {
  const path = value?.trim() || fallback;
  return `/${path.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
}
