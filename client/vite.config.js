import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    // Do not silently move to an origin the backend does not allow.
    strictPort: true
  },
  preview: {
    host: 'localhost',
    port: 5173,
    strictPort: true
  }
});
