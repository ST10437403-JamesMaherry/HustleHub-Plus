import { defineConfig } from 'vitest/config';
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
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    // api.js reads this once at import; tests never reach a real server.
    env: { VITE_API_URL: 'https://localhost:4000' },
    // Console output plus a JUnit file for the Part 2 evidence folder.
    reporters: ['default', ['junit', { outputFile: '../evidence/part2/frontend-tests/react-tests.xml' }]],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test/**'],
      // Paths relative to the repo root so Sonar can match them to client/src.
      reporter: ['text', ['lcov', { projectRoot: '..' }]]
    }
  }
});
