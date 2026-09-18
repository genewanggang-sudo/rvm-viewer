import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const testModelPath = fileURLToPath(new URL('../tmp/testdata/WD1-PSUP.RVM', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-local-rvm-test-model',
      configureServer(server) {
        server.middlewares.use('/__rvm-testdata/WD1-PSUP.RVM', (_request, response, next) => {
          if (!existsSync(testModelPath)) return next();
          response.setHeader('Content-Type', 'application/octet-stream');
          createReadStream(testModelPath).on('error', next).pipe(response);
        });
      },
    },
  ],
  base: '/sample/rvm-viewer/',
  server: { port: 5173, host: '127.0.0.1', strictPort: true },
  preview: { port: 5173, host: '127.0.0.1', strictPort: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
