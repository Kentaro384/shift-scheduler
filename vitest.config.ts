import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Generator tests run full-month generation several times per case,
    // which exceeds the 5s default on slow CI runners.
    testTimeout: 30000,
  },
});
