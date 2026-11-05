import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build works at a domain root (Vercel) and under /<repo>/ (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
