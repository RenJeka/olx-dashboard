import { defineConfig } from 'vitest/config';

// Тести фронтенду — лише чисті функції (utils, логіка stores): середовище node, без браузера й jsdom
// (docs/development.md §7). Окремий конфіг, щоб тести не тягнули React-плагін і dev-сервер із vite.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
