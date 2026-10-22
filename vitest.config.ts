import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // argon2id at 64 MiB + RSA-4096 keygen are slow on purpose
    testTimeout: 60_000,
  },
})
