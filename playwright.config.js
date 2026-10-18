// Browser tests (08 section 13.5). Builds the app, serves dist/ with vite
// preview, and runs the specs in test/browser against fixtures: every upstream
// host is answered from test/fixtures/golden.js, so a run is repeatable.
//
//   npm run test:browser                       the two Chromium projects
//   npx playwright test --grep-invert @visual  without the pixel comparisons (CI)
//   WEBKIT=1 npx playwright test               adds the WebKit projects (a Mac with WebKit)
//
// Service workers are blocked so route() sees every request. timing.spec.js
// allows them for its own contexts.
import { defineConfig } from '@playwright/test';

const PORT = 4173;
const size = (width, height) => ({ viewport: { width, height } });

const projects = [
  { name: 'chromium-390-light', use: { browserName: 'chromium', ...size(390, 844), colorScheme: 'light' } },
  { name: 'chromium-1280-dark', use: { browserName: 'chromium', ...size(1280, 800), colorScheme: 'dark' } }
];
// The container has no WebKit, so these exist only for a manual run on a Mac.
if (process.env.WEBKIT === '1') {
  projects.push(
    { name: 'webkit-390-light', use: { browserName: 'webkit', ...size(390, 844), colorScheme: 'light' } },
    { name: 'webkit-1280-dark', use: { browserName: 'webkit', ...size(1280, 800), colorScheme: 'dark' } }
  );
}

export default defineConfig({
  testDir: 'test/browser',
  testMatch: '**/*.spec.js',
  outputDir: 'test-results',
  snapshotPathTemplate: 'test/browser/__screenshots__/{arg}-{projectName}{ext}',
  reporter: 'list',
  forbidOnly: !!process.env.CI,
  retries: 0,
  // One worker: timing.spec.js measures milliseconds, and another test
  // running beside it on the same cores would move the numbers.
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block'
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0, animations: 'disabled' }
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Always a fresh build, so a screenshot never compares an old dist.
    reuseExistingServer: false,
    timeout: 180000
  },
  projects
});
