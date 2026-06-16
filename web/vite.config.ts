import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Client build → dist/client (static assets served by the Worker).
// SSR build (--ssr, --outDir dist/server) emits the prerender entry.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  // Bundle deps into the SSR output so scripts/prerender.mjs can import a
  // single self-contained file without resolving node_modules at runtime.
  ssr: {
    noExternal: true,
  },
});
