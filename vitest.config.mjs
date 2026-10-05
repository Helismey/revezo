import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
    },
  },
  test: {
    env: {
      DATABASE_URL: 'postgresql://postgres@127.0.0.1:5432/escala_test?schema=public',
      DIRECT_URL: 'postgresql://postgres@127.0.0.1:5432/escala_test?schema=public',
      AUTH_SECRET: 'teste-nao-usar-em-producao-000000000000000000',
      CRON_SECRET: 'teste-cron',
      NOTIFICATIONS_DRIVER: 'fake',
    },
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
