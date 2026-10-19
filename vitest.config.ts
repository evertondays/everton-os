import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // IndexedDB in Node, for idbfs.
    setupFiles: ['fake-indexeddb/auto'],
  },
})
