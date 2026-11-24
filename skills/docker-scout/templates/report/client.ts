/**
 * Interactions du rapport : tableau filtrable des failles et copie des blocs de code. report.mts retire les types
 * et insère le résultat dans la page.
 */
interface ClientRow {
  id: string; sev: 'C' | 'H' | 'M' | 'L' | 'U'; pkg: string; ver: string; fix: string | null; origin: string; url?: string; score: number | null;
  epss: number | null; kev?: boolean; sum: string; gone?: boolean; after?: string;
}
interface ClientData {
  images: { id: string; label: string; rows: ClientRow[]; versus?: string }[];
  severities: Record<string, string>; origins: Record<string, string>;
}

(() => {
  const ORDER = ['C', 'H', 'M', 'L', 'U'];
  const STORE = 'scout-filters';
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const el = (tag: string, className = '', text = ''): HTMLElement => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>('.copy')) {
    button.addEventListener('click', async () => {
      const text = button.closest('.code')?.querySelector('code')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copié';
      } catch {
        button.textContent = 'Copie refusée';
      }
      setTimeout(() => { button.textContent = 'Copier'; }, 1600);
    });
  }

  const source = document.getElementById('data');
  if (!source) return;
  const data = JSON.parse(source.textContent ?? '{}') as ClientData;
  const state = { image: 0, hidden: [] as string[], origin: '', fix: '', query: '', outcome: '' };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    if (Array.isArray(saved)) state.hidden = saved.filter((key): key is string => ORDER.includes(String(key)));
  } catch { /* stockage indisponible : filtres par défaut */ }

  const render = () => {
    const image = data.images[state.image];
    const query = state.query.trim().toLowerCase();
    const rows = image.rows.filter((row) => !state.hidden.includes(row.sev)
      && (!state.origin || row.origin === state.origin)
      && (!state.fix || (state.fix === 'kev' ? row.kev : state.fix === 'fixed' ? row.fix : !row.fix))
      && (!state.outcome || !image.versus || row.gone === (state.outcome === 'gone'))
      && (!query || `${row.id} ${row.pkg} ${row.sum}`.toLowerCase().includes(query)))
      .sort((a, b) => ORDER.indexOf(a.sev) - ORDER.indexOf(b.sev) || Number(Boolean(b.kev)) - Number(Boolean(a.kev)) || (b.epss ?? 0) - (a.epss ?? 0) || a.pkg.localeCompare(b.pkg));
    const head = byId('versus-head');
    head.hidden = !image.versus;
    head.textContent = image.versus ?? '';
    const body = document.createDocumentFragment();
    for (const row of rows) {
      const tr = el('tr');
      const severity = el('td');
      const tag = el('span', 'sevtag', data.severities[row.sev]);
      tag.style.setProperty('--c', `var(--sev-${row.sev.toLowerCase()})`);
      severity.append(tag);
      const id = el('td', 'mono');
      if (row.url) {
        const link = el('a', '', row.id) as HTMLAnchorElement;
        link.href = row.url;
        link.target = '_blank';
        link.rel = 'noopener';
        id.append(link);
      } else id.textContent = row.id;
      if (row.kev) id.append(' ', el('span', 'pill error', 'exploitée'));
      id.append(el('span', 'sum', row.sum));
      const score = el('td', 'tnum', row.score === null ? '–' : row.score.toFixed(1));
      const epss = el('td', 'tnum', row.epss === null ? '–' : `${(row.epss * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
      tr.append(severity, id, el('td', 'mono', `${row.pkg} ${row.ver}`), el('td', 'mono', row.fix ?? 'pas de correctif'), score, epss, el('td', '', data.origins[row.origin] ?? row.origin));
      if (image.versus) tr.append(el('td', row.gone ? 'yes' : 'no', row.gone ? `✓ ${row.after === 'retiré' ? 'retiré' : row.after ? `corrigée (${row.after})` : 'corrigée'}` : 'reste'));
      body.append(tr);
    }
    if (!rows.length) {
      const cell = el('td', 'empty', 'Aucune vulnérabilité ne correspond à ces filtres.') as HTMLTableCellElement;
      cell.colSpan = 8;
      const tr = el('tr');
      tr.append(cell);
      body.append(tr);
    }
    byId('vuln-rows').replaceChildren(body);
    byId('count').textContent = `${rows.length} sur ${image.rows.length}`;
  };

  for (const button of byId('images').querySelectorAll('button')) {
    button.addEventListener('click', () => {
      state.image = Number(button.dataset.index);
      for (const other of byId('images').querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
      render();
    });
  }
  for (const key of ORDER) {
    const button = el('button', 'fbtn') as HTMLButtonElement;
    button.type = 'button';
    button.style.setProperty('--c', `var(--sev-${key.toLowerCase()})`);
    button.setAttribute('aria-pressed', String(!state.hidden.includes(key)));
    button.append(el('i'), data.severities[key]);
    button.addEventListener('click', () => {
      state.hidden = state.hidden.includes(key) ? state.hidden.filter((item) => item !== key) : [...state.hidden, key];
      button.setAttribute('aria-pressed', String(!state.hidden.includes(key)));
      try { localStorage.setItem(STORE, JSON.stringify(state.hidden)); } catch { /* rien à garder */ }
      render();
    });
    byId('sev-filters').append(button);
  }
  byId<HTMLSelectElement>('origin-filter').addEventListener('change', (event) => { state.origin = (event.target as HTMLSelectElement).value; render(); });
  byId<HTMLSelectElement>('fix-filter').addEventListener('change', (event) => { state.fix = (event.target as HTMLSelectElement).value; render(); });
  document.getElementById('state-filter')?.addEventListener('change', (event) => { state.outcome = (event.target as HTMLSelectElement).value; render(); });
  byId<HTMLInputElement>('search').addEventListener('input', (event) => { state.query = (event.target as HTMLInputElement).value; render(); });
  render();
})();
