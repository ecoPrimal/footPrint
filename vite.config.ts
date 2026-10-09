import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/footprint/',
  server: {
    port: 5173,
    proxy: {
      '/ext': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-leaflet': ['leaflet', '@geoman-io/leaflet-geoman-free'],
          'vendor-turf': [
            '@turf/area', '@turf/distance', '@turf/centroid', '@turf/midpoint',
            '@turf/nearest-point-on-line', '@turf/buffer', '@turf/boolean-intersects',
            '@turf/line-intersect', '@turf/bearing', '@turf/polygon-to-line',
            '@turf/length', '@turf/helpers',
          ],
        },
      },
    },
  },
});
