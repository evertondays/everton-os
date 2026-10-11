import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { classicPages } from './classic/plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths: the same build works at a domain root and under
  // https://<user>.github.io/<repo>/ on GitHub Pages.
  base: './',
  plugins: [react(), classicPages()],
})
