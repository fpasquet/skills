import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const configDir = fileURLToPath(new URL('./.storybook', import.meta.url));

// Deux projets : les tests unitaires, et chaque histoire de Storybook rendue dans Chromium, accessibilité comprise.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}'] } },
      {
        extends: true,
        plugins: [storybookTest({ configDir })],
        test: {
          name: 'stories',
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
