import type { Preview } from '{{framework}}';
import { withThemeByClassName } from '@storybook/addon-themes';
import '{{entryImport}}';

const preview: Preview = {
  // Onglet Docs pour toutes les histoires, sans le répéter dans chaque fichier.
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Une violation d'accessibilité fait échouer le test de l'histoire (vitest, CI).
    a11y: { test: 'error' },
    options: {
      // Sections dans l'ordre des rôles, puis titres par ordre alphabétique ; les histoires d'un fichier gardent
      // leur ordre.
      storySort: {
        method: 'alphabetical',
        order: ['Design system', ['Introduction', 'Tokens', 'Classes'], 'UI', 'Shared', 'Layouts', 'Features', 'Pages'],
      },
    },
  },
  decorators: [
    withThemeByClassName({ themes: { Clair: '', Sombre: 'dark' }, defaultTheme: 'Clair' }),
    // Textes traduits : envelopper l'histoire dans le fournisseur de messages du projet (next-intl, i18next…).
  ],
};

export default preview;
