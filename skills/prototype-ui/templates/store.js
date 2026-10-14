/*
 * Socle du prototype : état simulé partagé par toutes les pages, gardé dans le navigateur.
 *
 * - window.PROTO_CONFIG  : configuration (id, titre, scénarios) injectée par build.mjs depuis prototype.json
 * - window.PROTO_DATA    : état initial (src/data.js), tiré du fil rouge des specs
 * - window.PROTO_PRESETS : variantes de l'état initial (src/data.js), une par situation de départ d'un
 *                          scénario : { 'premier-usage': (data) => { data.harnesses = []; } }
 * - window.PROTO_ACTIONS : actions métier (src/actions.js) ; `this` y désigne le store, chaque action est
 *                          suivie d'une sauvegarde automatique
 *
 * Dans les pages : $store.app.data (données), $store.app.ui (état d'interface de la page, non sauvegardé),
 * $store.app.notify('Message'), $store.app.go('e13.html?id=s-1042'), $store.app.param('id'),
 * $store.app.later(4000, () => …) (évolution simulée, sauvegardée), $store.app.<action>(…).
 * Adresse : ?scenario=<id>&scenario-step=<n> ouvre une étape de scénario avec son état ; les pages générées par
 * scaffold.mjs montrent un état de maquette avec ?state=<id>.
 * Commencer un scénario repart toujours de l'état initial, avec le preset du scénario s'il en a un.
 */
(function () {
  const config = window.PROTO_CONFIG || {};
  const key = `prototype:${config.id || 'default'}`;
  const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));
  // Le stockage peut être indisponible (navigation privée, aperçu) : le prototype marche alors sans mémoire
  const read = (suffix) => {
    try {
      const raw = localStorage.getItem(key + suffix);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const write = (suffix, value) => {
    try {
      localStorage.setItem(key + suffix, JSON.stringify(value));
    } catch {
      /* stockage indisponible */
    }
  };

  // ?scenario=<id>&scenario-step=<n> (n à partir de 1 ; nom distinct du paramètre step d'un assistant) : reconstitue l'état de cette étape (preset du scénario puis
  // presets des étapes jusqu'à n), mémorise chaque étape pour Précédent, et place le panneau sur l'étape.
  // Sert aux liens directs vers une étape et aux planches de check.mjs --scenarios.
  function replayFromUrl(initial) {
    const params = new URLSearchParams(location.search);
    const scenario = (config.scenarios || []).find((s) => s.id === params.get('scenario'));
    if (!scenario) return null;
    const presets = window.PROTO_PRESETS || {};
    const index = Math.max(0, Math.min((Number(params.get('scenario-step')) || 1) - 1, scenario.steps.length - 1));
    const data = clone(initial);
    if (scenario.preset) presets[scenario.preset]?.(data);
    const snapshots = {};
    for (let i = 0; i <= index; i++) {
      const preset = typeof scenario.steps[i] === 'object' ? scenario.steps[i]?.preset : null;
      if (preset) presets[preset]?.(data);
      snapshots[i] = clone(data);
    }
    write(':snapshots', snapshots);
    write(':scenario', { id: scenario.id, step: index });
    write(':data', data);
    return data;
  }

  document.addEventListener('alpine:init', () => {
    const initial = clone(window.PROTO_DATA);
    const replayed = replayFromUrl(initial);
    const actions = window.PROTO_ACTIONS || {};
    const wrapped = Object.fromEntries(
      Object.entries(actions).map(([name, fn]) => [
        name,
        function (...args) {
          const result = fn.apply(this, args);
          this.persist();
          return result;
        },
      ]),
    );
    Alpine.store('app', {
      data: replayed ?? read(':data') ?? initial,
      ui: {},
      toast: null,
      persist() {
        write(':data', this.data);
      },
      reset() {
        this.data = clone(initial);
        this.persist();
        write(':scenario', null);
        location.href = config.home || 'index.html';
      },
      notify(message) {
        this.toast = message;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => (this.toast = null), 3500);
      },
      go(page) {
        this.persist();
        location.href = page;
      },
      param(name) {
        return new URLSearchParams(location.search).get(name);
      },
      // Simule ce qui arrive sans la personne (un agent qui avance, une réponse) : effet puis sauvegarde
      later(ms, effect) {
        return setTimeout(() => {
          effect.call(this);
          this.persist();
        }, ms);
      },
      // État initial, éventuellement modifié par un preset ; sauvegardé
      load(preset) {
        const data = clone(initial);
        if (preset) {
          const apply = (window.PROTO_PRESETS || {})[preset];
          apply ? apply(data) : console.error('Unknown preset: ' + preset);
        }
        this.data = data;
        this.persist();
      },
      ...wrapped,
    });

    // Panneau « Scénarios » : déroulé guidé du scénario en cours. Chaque étape mène à son écran :
    //   étape = phrase, ou { text, page, preset } ;
    //   page   : écran où l'étape se joue, ouvert par Suivant / Précédent / clic sur l'étape ;
    //   preset : état garanti en arrivant sur l'étape (fonction de PROTO_PRESETS qui complète les données
    //            sans écraser ce que la personne a fait : « s'il n'y a pas de projet, créer Facturation »).
    // Les données sont mémorisées à l'entrée de chaque étape : Précédent les restaure.
    Alpine.data('protoScenarios', () => ({
      // ?clean masque le panneau (captures d'écran, démo projetée)
      hidden: new URLSearchParams(location.search).has('clean') || (read(':demo-hidden') ?? false),
      scenarios: config.scenarios || [],
      current: read(':scenario'),
      open: read(':panel-open') ?? false,
      // Observations de test : rattachées au scénario, à l'étape et à l'écran ; gardées après une
      // réinitialisation des données (plusieurs testeurs à la suite), effacées seulement à la demande
      notes: read(':notes') ?? [],
      noting: false,
      draft: '',
      exporting: false,
      init() {
        // Ancien format { done: [...] } : l'étape courante suit la dernière étape faite
        if (this.current && typeof this.current.step !== 'number') this.save({ id: this.current.id, step: (this.current.done || []).length });
        // « . » rouvre le panneau masqué (mode présentation)
        window.addEventListener('keydown', (e) => {
          if (e.key === '.' && !/input|textarea/i.test(e.target.tagName)) {
            this.hidden = false;
            write(':demo-hidden', false);
          }
        });
      },
      get scenario() {
        return this.scenarios.find((s) => s.id === this.current?.id);
      },
      get total() {
        return this.scenario?.steps.length ?? 0;
      },
      get finished() {
        return !!this.scenario && this.current.step >= this.total;
      },
      stepOf(i) {
        const step = this.scenario?.steps[i];
        return typeof step === 'string' ? { text: step } : step ?? {};
      },
      stepText(i) {
        return this.stepOf(i).text ?? '';
      },
      stepPage(i) {
        return this.stepOf(i).page ?? null;
      },
      // L'écran affiché est-il celui de l'étape ? (page et paramètres)
      onStepPage(i) {
        const page = this.stepPage(i);
        return !page || location.pathname.split('/').pop() + location.search === page;
      },
      save(current) {
        this.current = current;
        write(':scenario', current);
      },
      setOpen(value) {
        this.open = value;
        write(':panel-open', value);
      },
      // Arrivée sur une étape : données restaurées (retour) ou complétées par le preset de l'étape,
      // mémorisées, puis ouverture de son écran
      enter(index, { restore = false } = {}) {
        const app = Alpine.store('app');
        const snapshots = read(':snapshots') || {};
        let data;
        if (restore && snapshots[index]) {
          data = clone(snapshots[index]);
        } else {
          data = clone(app.data);
          const preset = this.stepOf(index).preset;
          if (preset) {
            const apply = (window.PROTO_PRESETS || {})[preset];
            apply ? apply(data) : console.error('Unknown preset: ' + preset);
          }
          snapshots[index] = clone(data);
          write(':snapshots', snapshots);
        }
        this.save({ ...this.current, step: index });
        const page = this.stepPage(index);
        const samePath = page && page.split('?')[0] === location.pathname.split('/').pop();
        if (page && !this.onStepPage(index) && !samePath) {
          // Changement d'écran : les données vont droit au stockage, la page quittée ne se redessine pas
          write(':data', data);
          location.href = page;
        } else {
          // Même écran, autres paramètres (e4.html → e4.html?step=2) : pas de rechargement, la page
          // écoute proto:params pour se mettre à jour
          if (page && !this.onStepPage(index)) {
            history.replaceState(null, '', page);
            window.dispatchEvent(new CustomEvent('proto:params'));
          }
          app.data = data;
          app.persist();
        }
      },
      start(id) {
        const scenario = this.scenarios.find((s) => s.id === id);
        Alpine.store('app').load(scenario.preset);
        write(':snapshots', {});
        this.save({ id, step: 0 });
        this.setOpen(true);
        const first = this.stepOf(0);
        if (first.preset) return this.enter(0);
        write(':snapshots', { 0: clone(Alpine.store('app').data) });
        location.href = first.page ?? scenario.start;
      },
      // Suivant : étape suivante et son écran ; après la dernière, le scénario est terminé
      next() {
        if (this.finished) return this.start(this.current.id);
        if (this.current.step + 1 >= this.total) return this.save({ ...this.current, step: this.total });
        this.enter(this.current.step + 1);
      },
      // Précédent : étape précédente, avec les données qu'elle avait
      previous() {
        if (this.finished) return this.enter(this.total - 1, { restore: true });
        if (this.current.step > 0) this.enter(this.current.step - 1, { restore: true });
      },
      // Clic sur une étape : en avant, les presets des étapes intermédiaires s'appliquent dans l'ordre
      goTo(index) {
        if (index <= this.current.step) return this.enter(index, { restore: true });
        const app = Alpine.store('app');
        const data = clone(app.data);
        for (let i = this.current.step + 1; i < index; i++) {
          const preset = this.stepOf(i).preset;
          if (preset && window.PROTO_PRESETS?.[preset]) window.PROTO_PRESETS[preset](data);
        }
        write(':data', data);
        app.data = data;
        this.enter(index);
      },
      stop() {
        this.save(null);
        write(':snapshots', null);
      },
      addNote() {
        const text = this.draft.trim();
        if (!text) return;
        const scenario = this.scenario;
        const step = scenario && !this.finished ? this.current.step : null;
        this.notes = [...this.notes, {
          scenario: scenario?.title ?? null,
          step: step === null ? null : step + 1,
          stepText: step === null ? null : this.stepText(step),
          page: location.pathname.split('/').pop() + location.search.replace(/[?&](check|clean)\b/g, ''),
          at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          text,
        }];
        write(':notes', this.notes);
        this.draft = '';
        this.noting = false;
        Alpine.store('app').notify('Observation notée');
      },
      // Compte rendu Markdown : par scénario, puis par étape
      get exportText() {
        const lines = [`# Observations · ${config.title || 'Prototype'}`, '', `Exporté le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, ${this.notes.length} observation(s).`];
        let scenario, step;
        for (const n of this.notes) {
          if (n.scenario !== scenario) {
            scenario = n.scenario;
            step = undefined;
            lines.push('', `## ${scenario ?? 'Exploration libre'}`);
          }
          if (n.step !== step) {
            step = n.step;
            if (step !== null) lines.push('', `### Étape ${step} · ${n.stepText}`);
            lines.push('');
          }
          lines.push(`- ${n.at} · ${n.page} · ${n.text.replace(/\n+/g, ' ')}`);
        }
        return lines.join('\n') + '\n';
      },
      async copyNotes() {
        try {
          await navigator.clipboard.writeText(this.exportText);
          Alpine.store('app').notify('Observations copiées');
        } catch {
          // Presse-papiers refusé (aperçu, iframe) : texte sélectionné pour un copier manuel
          this.$refs.exportArea?.select();
          Alpine.store('app').notify('Sélection prête : copiez avec Ctrl+C ou ⌘C');
        }
      },
      downloadNotes() {
        const url = URL.createObjectURL(new Blob([this.exportText], { type: 'text/markdown' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: `observations-${config.id || 'prototype'}.md` });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      clearNotes() {
        if (!confirm('Effacer toutes les observations ?')) return;
        this.notes = [];
        this.exporting = false;
        write(':notes', []);
      },
      hide() {
        this.hidden = true;
        this.setOpen(false);
        write(':demo-hidden', true);
      },
    }));
  });

  // Page révélée quand Alpine a démarré et que les styles sont prêts (immédiat en CSS compilé ; en mode CDN,
  // quand Tailwind navigateur a produit les styles), au plus tard après 1,5 s : ni page brute ni états
  // superposés en changeant d'écran
  (function reveal() {
    const root = document.documentElement;
    // Sonde : la règle [data-proto-probe] { display: none } fait partie des styles de la page
    const probe = document.createElement('div');
    probe.setAttribute('data-proto-probe', '');
    root.appendChild(probe);
    let alpineReady = false;
    document.addEventListener('alpine:initialized', () => (alpineReady = true));
    const started = performance.now();
    (function wait() {
      const styled = getComputedStyle(probe).display === 'none';
      if ((styled && alpineReady) || performance.now() - started > 1500) {
        probe.remove();
        root.classList.add('proto-ready');
      } else requestAnimationFrame(wait);
    })();
  })();

  // Les icônes ajoutées par Alpine (x-for, x-if, x-show) sont dessinées dès leur apparition
  let pending = false;
  new MutationObserver(() => {
    if (pending || !window.lucide) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (document.querySelector('i[data-lucide]')) lucide.createIcons();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
