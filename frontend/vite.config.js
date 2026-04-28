import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Use './' base for Electron (file:// protocol), '/' for Vercel/web
const isElectron = process.env.BUILD_TARGET === 'electron';

export default defineConfig({
  plugins: [react()],
  base: isElectron ? './' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5001', ws: true, changeOrigin: true },
    },
  },
});
