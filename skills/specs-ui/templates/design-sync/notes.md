# design-sync notes · {{PRODUCT}} (tokens only)

- Design system **tokens only**: no React components. `{{PKG}}` is a local mini-package built by `build.mjs` (template of the specs-ui skill) from `{{SPECS_REL}}/tokens.css` and the specs mockups.
- `styles.css` = Tailwind v4 CLI output: every token as a CSS variable (`@theme static`), the utilities used in `{{SPECS_REL}}/sources` and `{{SPECS_REL}}/design-system`, the whole token vocabulary and common layout ranges (forced with `@source inline`). Fonts come from the first lot's font URL via `@import url(...)` (`[FONT_REMOTE]` expected).
- The converter requires `react` / `react-dom` under `--node-modules` even for a tokens-only DS: they are devDependencies.
- Visible cards: the converter emits none for tokens-only. `build.mjs` turns the specs-ui catalogue (`{{SPECS_REL}}/design-system/{foundations,components,patterns}/*.html`, first line `@dsCard`) into `cards/` linked to `../../styles.css`. `package-build.mjs` wipes `ds-bundle/`: always run `node build.mjs --into ds-bundle` **after** it. Cards stay outside `components/` (validate expects as many `components/` previews as bundle components, here 0) and are not covered by `_ds_sync.json`.
- Refresh the specs catalogue first when the specs change: `node <specs-ui skill>/scripts/export-design-system.mjs {{SPECS_REL}}`.

## Rebuild

```sh
npm run build
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./dist/index.js --out ./ds-bundle
node build.mjs --into ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

Upload writes: the standard list plus `cards/**`.

## Known render warns

- `[FONT_REMOTE]`: fonts served by a font host, expected.
- `[DTS_REACT]` @types/react missing from the package's node_modules: irrelevant, no component props.

## Re-sync risks

- Tokens and cards are copies: rebuild after any change to `tokens.css` or to the specs catalogue.
- Utility classes not used in the specs and outside the forced ranges are absent from `styles.css`.
- Cards load Lucide from jsdelivr for icons (network at render time).
