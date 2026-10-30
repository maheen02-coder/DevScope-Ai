import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'server/**/*.test.js'],
    testTimeout: 25_000,
    hookTimeout: 25_000,
    restoreMocks: true,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['server/**/*.js', 'src/**/*.{js,jsx}'],
      exclude: [
        'server/tests/**',
        'server/scripts/**',
        'server/index.js',
        'src/**/*.test.{js,jsx}',
        'src/test/**',
        'src/main.jsx',
      ],
    },
  },
})
