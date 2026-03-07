import { defineConfig } from 'vite';

export default defineConfig({
  base: '/3d-driving-game/',
  define: {
    __AUTH_HASH__: JSON.stringify(process.env.AUTH_HASH || ''),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
