/*
 * Contrôles lus par scripts/check.mjs, actifs seulement avec ?check dans l'adresse.
 * Placé en tête de page, avant Alpine : erreurs JS, erreurs d'expression Alpine, avertissements,
 * icônes inconnues, blocs non assemblés, débordement horizontal. Le résultat est écrit en JSON dans
 * <pre id="proto-check">, que check.mjs récupère avec --dump-dom.
 */
(function () {
  if (!/[?&]check\b/.test(location.search)) return;
  const errors = [];
  const warnings = [];
  const text = (args) => args.map((a) => (a instanceof Error ? a.message : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ').slice(0, 300);
  window.addEventListener('error', (e) => errors.push(text([e.message || e.error || 'error'])));
  window.addEventListener('unhandledrejection', (e) => errors.push(text(['unhandled rejection', e.reason])));
  const originalError = console.error;
  console.error = (...args) => {
    errors.push(text(args));
    originalError.apply(console, args);
  };
  const originalWarn = console.warn;
  console.warn = (...args) => {
    // Alpine signale les expressions en erreur par un avertissement
    (/Alpine Expression Error/.test(String(args[0])) ? errors : warnings).push(text(args));
    originalWarn.apply(console, args);
  };
  window.addEventListener('load', () =>
    setTimeout(() => {
      const result = {
        errors,
        warnings,
        unknownIcons: [...new Set([...document.querySelectorAll('i[data-lucide]')].map((el) => el.dataset.lucide))],
        unassembled: [...new Set([...document.querySelectorAll('[data-use]')].map((el) => el.dataset.use))],
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1 ? document.documentElement.scrollWidth - window.innerWidth : 0,
        // Page encore telle que générée par scaffold.mjs (marquée data-proto-static) : nombre de ses états
        staticStates: document.querySelector('[data-proto-static]') ? document.querySelectorAll('section[data-state]').length : 0,
        alpine: !!window.Alpine,
      };
      const pre = document.createElement('pre');
      pre.id = 'proto-check';
      pre.hidden = true;
      pre.textContent = JSON.stringify(result);
      document.body.append(pre);
    }, 1200),
  );
})();
