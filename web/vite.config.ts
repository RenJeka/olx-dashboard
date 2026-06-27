import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Google Sign-In (popup ux_mode) повертає credential у вікно-опенер через
    // window.postMessage. Без явної COOP Chrome попереджає/блокує цей виклик
    // ("Cross-Origin-Opener-Policy policy would block the window.postMessage call").
    // `same-origin-allow-popups` зберігає звʼязок із попапом — рекомендований режим Google.
    // Той самий заголовок треба виставити на проді (статик-хостинг фронта).
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
