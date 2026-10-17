import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Cloudflare Workers Builds sets WORKERS_CI_COMMIT_SHA. Locally there is none.
const sha = (process.env.WORKERS_CI_COMMIT_SHA || '').slice(0, 7);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(sha ? `${pkg.version}+${sha}` : pkg.version)
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.js
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Putney Landing rowing conditions',
        short_name: 'Putney Row',
        description: 'Go, caution or stay off: rowing conditions on the Connecticut River at Putney Landing, VT.',
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
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        globIgnores: ['**/*vietnamese*', '**/*latin-ext*'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
