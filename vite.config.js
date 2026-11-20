import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the built site works from any folder or host
  base: './',
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/]three/ },
            { name: 'motion', test: /node_modules[\/](gsap|lenis)/ },
          ],
        },
      },
    },
  },
});
