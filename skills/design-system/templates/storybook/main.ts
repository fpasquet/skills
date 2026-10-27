import type { StorybookConfig } from '{{framework}}';

/** Documentation du design system : tokens, classes sémantiques, composants sans état et écrans. */
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-themes', '@storybook/addon-vitest'],
  framework: { name: '{{framework}}', options: {} },
  core: { disableTelemetry: true },
};

export default config;
