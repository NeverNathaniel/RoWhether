import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.js
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Putney Landing rowing conditions',
        short_name: 'Putney Row',
        description: 'Go, caution or stay-off calls for rowing on the Connecticut River at Putney Landing, VT.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#EEF3F2',
        theme_color: '#1E4A52',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache the app shell only. API responses are not cached by the
        // service worker; the app keeps its own last-good copy.
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        globIgnores: ['**/*vietnamese*', '**/*latin-ext*'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
