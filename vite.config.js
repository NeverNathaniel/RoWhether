import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { locationsPlugin, shellNames } from './scripts/locations/plugin.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Cloudflare Workers Builds sets WORKERS_CI_COMMIT_SHA. Locally there is none.
const sha = (process.env.WORKERS_CI_COMMIT_SHA || '').slice(0, 7);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(sha ? `${pkg.version}+${sha}` : pkg.version)
  },
  plugins: [
    locationsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.js
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'RoWhether',
        short_name: 'RoWhether',
        description: 'Go, caution or stay off: rowing conditions for your launch site, hour by hour.',
        // The app's identity, as today's start_url resolves: https://rowhether.com/.
        // A different id would make installs a second app (07 6.3).
        id: '/',
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
        // Precache the app shell and the curated location files. API responses
        // are not cached by the service worker; the app keeps its own last-good
        // copy. A location's <slug>.html is for a first visit and link previews
        // only (every navigation falls back to the precached index.html), so
        // each one is ignored by name, from the files under data/locations.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}', 'locations/*.json'],
        globIgnores: ['**/*vietnamese*', '**/*latin-ext*', ...shellNames()],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // With registerType 'autoUpdate' the plugin adds these two only when it
        // also injects the register script. Here injectRegister is false, so
        // without them a new worker waits until every tab and the installed app
        // are closed. With them it activates at once and takes the open page,
        // and the register code in src/main.js reloads the page once.
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  test: {
    environment: 'node',
    // Playwright's *.spec.js files live in test/browser and run with `npm run test:browser`.
    exclude: ['**/node_modules/**', 'test/browser/**']
  }
});
