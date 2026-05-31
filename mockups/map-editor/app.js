/* ------------------------------------------------------------------
 * Map Editor mockup — interactivity.
 * Demonstrates the user-visible B1 fixes:
 *   #86  typing keeps focus (no re-render on keystroke) + saved entry persists
 *   #92  add→move keeps the row, add→remove drops it cleanly
 * All on a baked-in working copy; nothing leaves the page.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';
  const { COLLECTIONS, FLOOR_META, SAMPLE_RANGES, ORPHANS, STR } = window.MOCK;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const S = {
    theme: 'a', lang: 'he', floorId: 1,   // floor 1 is richly marked; floor 0 has just 1 shelf
    mode: 'idle',           // idle | shelf | reassign | triage
    selected: null,         // shelf code
    reassign: null,         // { entry, fromCode, fromFloor, orphan? }
    data: [], baseline: [], seed: [],     // built at init from the real SVG shelf codes
  };

  /* Build the working model from the REAL shelf codes parsed out of each floor
     SVG, seeding sample ranges onto a subset so the demo has shelves to edit. */
  function buildFloors(assets) {
    return FLOOR_META.map(meta => {
      const codes = (assets[meta.id] && assets[meta.id].codes) || [];
      let pop = 0;
      const shelves = codes.map((code, i) => {
        const entries = [];
        if (i < 5 || i % 7 === 0) {                 // ~first 5 + every 7th shelf gets data
          const base = `seed-${meta.id}-${i}`;
          if (pop === 0) {                          // conflict demo: overlapping, same collection
            entries.push({ id: base + '-0', col: 'jud', from: '221', to: '249.9' });
            entries.push({ id: base + '-1', col: 'jud', from: '240', to: '275' });
          } else if (pop === 1) {                   // touching-boundary demo: abutting is NOT a conflict
            entries.push({ id: base + '-0', col: 'soc', from: '300', to: '349.9' });
            entries.push({ id: base + '-1', col: 'soc', from: '349.9', to: '389.9' });
          } else {
            const tmpl = SAMPLE_RANGES[pop % SAMPLE_RANGES.length];
            entries.push({ id: base + '-0', col: tmpl.col, from: tmpl.from, to: tmpl.to });
          }
          pop++;
        }
        return { code, entries };
      });
      return { id: meta.id, he: meta.he, en: meta.en, shelves, orphans: clone(ORPHANS[meta.id] || []) };
    });
  }

  /* ---------- tiny helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  function t(key, vars) {
    let s = (STR[S.lang] && STR[S.lang][key]) != null ? STR[S.lang][key] : key;
    if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
    return s;
  }
  const collator = () => COLLECTIONS;
  const col = (id) => COLLECTIONS.find(c => c.id === id) || COLLECTIONS[0];
  const colName = (id) => col(id)[S.lang] || col(id).en;
  const tone = (id) => 'var(--tone-' + col(id).tone + ')';
  const floor = (id = S.floorId) => S.data.find(f => f.id === id);
  const shelf = (code, fl = floor()) => fl.shelves.find(s => s.code === code);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  let uid = 1000; const newId = () => 'n' + (uid++);

  /* ---------- validation (mirrors the catalog rule: touching boundaries OK) ---------- */
  function num(v) { const s = String(v).trim(); return /^[0-9]+(\.[0-9]+)?$/.test(s) ? parseFloat(s) : null; }
  function startGtEnd(e) {
    if (!e.from || !e.to) return false;
    const a = num(e.from), b = num(e.to);
    if (a != null && b != null) return a > b;
    return String(e.from).toUpperCase() > String(e.to).toUpperCase();
  }
  function overlap(a, b) {
    if (a.col !== b.col) return false;
    const a1 = num(a.from), b1 = num(a.to), a2 = num(b.from), b2 = num(b.to);
    if ([a1, b1, a2, b2].every(x => x != null)) return a1 < b2 && a2 < b1; // strict → abutting is fine
    if (a.from && a.to && b.from && b.to) {
      const s1 = a.from.toUpperCase(), t1 = a.to.toUpperCase(), s2 = b.from.toUpperCase(), t2 = b.to.toUpperCase();
      return s1 < t2 && s2 < t1;
    }
    return false;
  }
  function entryWarnings(sh, e) {
    const out = [];
    if (startGtEnd(e)) out.push({ type: 'danger', msg: t('mapEditor.warning.startGtEnd') });
    if (sh.entries.some(o => o.id !== e.id && overlap(e, o))) out.push({ type: 'warn', msg: t('mapEditor.warning.overlap') });
    return out;
  }
  const shelfWarnCount = (sh) => sh.entries.reduce((n, e) => n + entryWarnings(sh, e).length, 0);
  const shelfDirty = (sh) => sh.entries.some(e => e._new || e._dirty);
  const dirtyCount = (sh) => sh.entries.filter(e => e._new || e._dirty).length;

  /* ============================ CHROME ============================ */
  function renderChrome() {
    document.documentElement.lang = S.lang;
    document.documentElement.dir = S.lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('data-theme', S.theme);

    $('#brand-title').textContent = t('app.title');
    $('#preview-badge').textContent = t('app.previewBadge');
    $('#batch-note').innerHTML = '<span class="dot">●</span> ' + esc(t('batch.note'));

    const tabs = $('#floor-tabs'); tabs.innerHTML = '';
    FLOOR_META.forEach(f => {
      const b = document.createElement('button');
      b.textContent = (S.lang === 'he' ? f.he : f.en);
      b.className = f.id === S.floorId ? 'is-active' : '';
      b.onclick = () => switchFloor(f.id);
      tabs.appendChild(b);
    });

    // style + lang switchers
    $('#style-label').textContent = t('style.label');
    [['a', 'style.a'], ['b', 'style.b'], ['c', 'style.c']].forEach(([k, sk]) => {
      const btn = $('#style-' + k); btn.textContent = t(sk);
      btn.classList.toggle('is-active', S.theme === k);
    });
    $('#lang-toggle').textContent = t('lang.toggle');
    $('#help-btn').textContent = t('help');
    $('#reset-btn').textContent = t('reset');
    FB.relabel();
  }

  /* ============================== MAP ============================== */
  let mapToken = 0;
  async function renderMap() {
    const host = $('#map-svg-host');
    const my = ++mapToken;
    let assets;
    try { assets = await window.FloorSvg.loadFloorAssets(S.floorId); }
    catch (e) { host.innerHTML = '<div class="idle"><p>המפה לא נטענה / Could not load the floor map.</p></div>'; return; }
    if (my !== mapToken) return;                 // a newer floor switch superseded us
    host.innerHTML = assets.svg;
    decorateMap();
  }
  function decorateMap() {
    const fl = floor(); if (!fl) return;
    document.querySelectorAll('#map-svg-host [data-map-object="shelf"]').forEach(el => {
      const code = el.id;
      const sh = shelf(code, fl);
      el.classList.add('mock-shelf');
      el.classList.toggle('has-entries', !!(sh && sh.entries.length));
      el.classList.toggle('is-selected', S.selected === code && S.mode === 'shelf');
      el.classList.toggle('has-warn', !!(sh && shelfWarnCount(sh) > 0));
      const picking = S.mode === 'reassign';
      el.classList.toggle('is-target', picking && (!S.reassign || S.reassign.fromCode !== code));
    });
    $('#map-canvas').classList.toggle('is-picking', S.mode === 'reassign');
    const strip = $('#reassign-strip');
    if (S.mode === 'reassign') {
      strip.hidden = false;
      strip.querySelector('.msg').textContent = t('mapEditor.reassign.banner.move');
      strip.querySelector('button').textContent = t('mapEditor.reassign.cancel');
    } else { strip.hidden = true; }
  }

  /* ============================= PANEL ============================= */
  const panel = () => $('#side-panel');

  function renderPanel() {
    if (S.mode === 'idle') return renderIdle();
    if (S.mode === 'triage') return renderTriage();
    if (S.mode === 'reassign') return renderReassignPane();
    if (S.mode === 'shelf') return renderShelf();
  }

  function legendHTML() {
    const items = COLLECTIONS.map(c =>
      `<li><span class="swatch" style="background:var(--tone-${c.tone})"></span>${esc(c[S.lang] || c.en)}</li>`).join('');
    return `<div class="legend"><h4>${esc(t('legend.title'))}</h4><ul>${items}</ul></div>`;
  }

  function renderIdle() {
    const orphans = floor().orphans || [];
    const n = orphans.length;
    panel().innerHTML = `
      <div class="panel-head"><h2 class="panel-title">${esc(S.lang === 'he' ? floor().he : floor().en)}</h2></div>
      <div class="panel-body">
        <div class="idle">
          <div class="glyph">🗺️</div>
          <p>${esc(t('mapEditor.empty'))}</p>
          <div class="hint">${esc(t('mapEditor.empty.hint'))}</div>
          <button class="nudge" id="nudge" ${n > 0 ? '' : 'hidden'}>
            <span>${esc(t('mapEditor.idle.nudge', { n }))}</span>
            <span class="go">${esc(t('mapEditor.idle.nudge.expand'))}</span>
          </button>
          ${legendHTML()}
        </div>
      </div>`;
    const nudge = $('#nudge'); if (nudge) nudge.onclick = () => { S.mode = 'triage'; sync(); };
  }

  function renderTriage() {
    const orphans = floor().orphans || [];
    const cards = orphans.length ? orphans.map(o => `
      <div class="triage-card">
        <div class="what"><span class="swatch" style="background:${tone(o.col)}"></span>
          ${esc(colName(o.col))} <bdi class="bdi">${esc(o.from || '—')}–${esc(o.to || '—')}</bdi></div>
        <div class="reason">${esc(t('mapEditor.triage.card.' + o.reason))}</div>
        <button class="link-btn" data-orphan="${esc(o.id)}">→ ${esc(t('mapEditor.triage.card.setShelf'))}</button>
      </div>`).join('') : `<div class="shelf-empty"><p>${esc(t('mapEditor.triage.empty'))}</p></div>`;
    panel().innerHTML = `
      <div class="panel-head">
        <button class="back" id="triage-back">${esc(t('mapEditor.triage.back'))}</button>
        <h2 class="panel-title" style="font-size:1.05rem">${esc(t('mapEditor.triage.title'))}</h2>
      </div>
      <div class="panel-body">${cards}</div>`;
    $('#triage-back').onclick = () => { S.mode = 'idle'; sync(); };
    panel().querySelectorAll('[data-orphan]').forEach(b => b.onclick = () => {
      const o = (floor().orphans || []).find(x => x.id === b.dataset.orphan);
      enterReassign({ orphan: o });
    });
  }

  function renderReassignPane() {
    const r = S.reassign;
    const what = r.orphan
      ? `${esc(colName(r.orphan.col))} <bdi class="bdi">${esc(r.orphan.from || '—')}–${esc(r.orphan.to || '—')}</bdi>`
      : `${esc(colName(r.entry.col))} <bdi class="bdi">${esc(r.entry.from || '—')}–${esc(r.entry.to || '—')}</bdi>`;
    const toneId = r.orphan ? r.orphan.col : r.entry.col;
    panel().innerHTML = `
      <div class="panel-head"><h2 class="panel-title" style="font-size:1.05rem">${esc(t('mapEditor.reassign.title'))}</h2></div>
      <div class="panel-body">
        <div class="reassign-pane">
          <div class="glyph">📍</div>
          <div class="moving"><span class="swatch" style="background:${tone(toneId)}"></span>${what}</div>
          <p style="margin-top:var(--space-3)">${esc(t('mapEditor.reassign.banner.move'))}</p>
        </div>
      </div>
      <div class="panel-foot"><button class="btn btn-ghost" id="reassign-cancel" style="flex:1">${esc(t('mapEditor.reassign.cancel'))}</button></div>`;
    $('#reassign-cancel').onclick = cancelReassign;
  }

  function renderShelf() {
    const sh = shelf(S.selected);
    if (!sh) { S.mode = 'idle'; return renderIdle(); }
    const head = `
      <div class="panel-head">
        <button class="back" id="shelf-back">${esc(t('mapEditor.shelf.back'))}</button>
        <div style="flex:1;min-width:0">
          <h2 class="panel-title">${esc(t('mapEditor.shelf.header', { label: sh.code }))}</h2>
          <span class="panel-sub">${esc(t('mapEditor.shelf.count', { n: sh.entries.length }))}</span>
        </div>
        <span class="pending-chip" id="pending-chip" hidden></span>
      </div>`;
    let body;
    if (!sh.entries.length) {
      body = `<div class="panel-body"><div class="shelf-empty">
          <p>${esc(t('mapEditor.shelf.empty.message'))}</p>
          <button class="add-entry" id="add-first">${esc(t('mapEditor.shelf.empty.cta'))}</button>
        </div></div>`;
    } else {
      const cards = sh.entries.map(e => entryCardHTML(sh, e)).join('');
      body = `<div class="panel-body">
          <div class="shelf-banner" id="shelf-banner" hidden></div>
          ${cards}
          <button class="add-entry" id="add-entry">${esc(t('mapEditor.addRange'))}</button>
        </div>`;
    }
    const foot = `<div class="panel-foot" id="shelf-foot">
        <button class="btn btn-primary" id="btn-save">${esc(t('mapEditor.save'))}</button>
        <button class="btn btn-ghost" id="btn-discard">${esc(t('mapEditor.discard'))}</button>
      </div>`;
    panel().innerHTML = head + body + foot;

    $('#shelf-back').onclick = () => { S.mode = 'idle'; S.selected = null; sync(); };
    const addBtn = $('#add-entry') || $('#add-first');
    if (addBtn) addBtn.onclick = () => addEntry(sh);
    $('#btn-save').onclick = () => saveShelf(sh);
    $('#btn-discard').onclick = () => discardShelf(sh);
    sh.entries.forEach(e => wireCard(sh, e));
    updateShelfBanner(sh); updateFooter(sh); updatePendingChip(sh);
  }

  function entryCardHTML(sh, e) {
    const opts = COLLECTIONS.map(c => `<option value="${c.id}" ${c.id === e.col ? 'selected' : ''}>${esc(c[S.lang] || c.en)}</option>`).join('');
    const warns = entryWarnings(sh, e);
    const conflict = warns.length ? 'is-conflict' : '';
    const newChip = e._new ? `<span class="tag" style="background:var(--accent-weak);color:var(--accent);font-size:.66rem;font-weight:700;padding:1px 8px;border-radius:999px">●</span>` : '';
    return `
      <div class="entry-card ${conflict}" data-id="${esc(e.id)}" style="--card-tone:${tone(e.col)}">
        <div class="field">
          <label>${esc(t('mapEditor.field.collection'))} ${newChip}</label>
          <select data-f="col">${opts}</select>
        </div>
        <div class="range-row">
          <div class="field"><label>${esc(t('mapEditor.field.from'))}</label><input data-f="from" value="${esc(e.from)}" inputmode="decimal"></div>
          <div class="field"><label>${esc(t('mapEditor.field.to'))}</label><input data-f="to" value="${esc(e.to)}" inputmode="decimal"></div>
        </div>
        <div class="entry-warn ${warns[0] && warns[0].type === 'danger' ? 'danger' : ''}" data-warn ${warns.length ? '' : 'hidden'}>
          <span>⚠</span><span data-warnmsg>${warns.length ? esc(warns[0].msg) : ''}</span>
        </div>
        <div class="entry-actions">
          <button class="link-btn" data-act="move">↔ ${esc(t('mapEditor.move'))}</button>
          <button class="link-btn danger" data-act="del">${esc(t('mapEditor.delete'))}</button>
        </div>
      </div>`;
  }

  /* ----- IN-PLACE editing: the #86 fix. NEVER rebuilds inputs on keystroke. ----- */
  function wireCard(sh, e) {
    const card = panel().querySelector(`.entry-card[data-id="${e.id}"]`);
    if (!card) return;
    card.querySelector('[data-f="col"]').addEventListener('change', ev => {
      e.col = ev.target.value; if (!e._new) e._dirty = true;
      card.style.setProperty('--card-tone', tone(e.col));
      applyRowValidation(sh, e, card);
    });
    ['from', 'to'].forEach(f => {
      const input = card.querySelector(`[data-f="${f}"]`);
      input.addEventListener('input', ev => {           // <-- input, in place, no re-render
        e[f] = ev.target.value;
        if (!e._new) e._dirty = true;
        applyRowValidation(sh, e, card);                // updates warnings/tint ONLY
      });
    });
    card.querySelector('[data-act="move"]').onclick = () => enterReassign({ entry: e, fromCode: sh.code });
    card.querySelector('[data-act="del"]').onclick = () => deleteEntry(sh, e);
  }

  function applyRowValidation(sh, e, card) {
    const warns = entryWarnings(sh, e);
    card.classList.toggle('is-conflict', warns.length > 0);
    const warnEl = card.querySelector('[data-warn]');
    warnEl.hidden = warns.length === 0;
    warnEl.classList.toggle('danger', warns[0] && warns[0].type === 'danger');
    if (warns.length) card.querySelector('[data-warnmsg]').textContent = warns[0].msg;
    // sibling cards may have gained/lost an overlap → refresh their warn lines too (still no input rebuild)
    sh.entries.forEach(o => {
      if (o.id === e.id) return;
      const oc = panel().querySelector(`.entry-card[data-id="${o.id}"]`);
      if (!oc) return;
      const ow = entryWarnings(sh, o);
      oc.classList.toggle('is-conflict', ow.length > 0);
      const oe = oc.querySelector('[data-warn]'); oe.hidden = ow.length === 0;
      oe.classList.toggle('danger', ow[0] && ow[0].type === 'danger');
      if (ow.length) oc.querySelector('[data-warnmsg]').textContent = ow[0].msg;
    });
    updateShelfBanner(sh); updateFooter(sh); updatePendingChip(sh); decorateMap();
  }

  function updateShelfBanner(sh) {
    const b = $('#shelf-banner'); if (!b) return;
    const n = shelfWarnCount(sh);
    b.hidden = n === 0;
    if (n) b.innerHTML = '⚠ ' + esc(t('mapEditor.warning.banner', { n }));
  }
  function updateFooter(sh) {
    const save = $('#btn-save'), disc = $('#btn-discard'); if (!save) return;
    const dirty = shelfDirty(sh);
    save.disabled = !dirty; disc.disabled = !dirty;
  }
  function updatePendingChip(sh) {
    const chip = $('#pending-chip'); if (!chip) return;
    const n = dirtyCount(sh);
    chip.hidden = n === 0;
    if (n) chip.textContent = t('mapEditor.pending', { n });
  }

  /* ---------- structural ops (re-render is allowed here) ---------- */
  function addEntry(sh) {
    const e = { id: newId(), col: sh.entries[0] ? sh.entries[0].col : 'gen', from: '', to: '', _new: true };
    sh.entries.push(e);
    toast(t('mapEditor.toast.added', { label: sh.code }));
    renderShelf();
    const card = panel().querySelector(`.entry-card[data-id="${e.id}"]`);
    if (card) card.querySelector('[data-f="from"]').focus();
  }
  function deleteEntry(sh, e) {                       // #92: add→remove drops cleanly
    if (!e._new && !confirm(t('mapEditor.delete.confirm'))) return;
    sh.entries = sh.entries.filter(x => x.id !== e.id);
    toast(t('mapEditor.toast.removed', { label: sh.code }));
    renderShelf(); decorateMap();
  }
  function saveShelf(sh) {                            // #86: saved entry stays visible
    sh.entries.forEach(e => { delete e._new; delete e._dirty; });
    // re-baseline this shelf
    const bf = S.baseline.find(f => f.id === S.floorId);
    const bs = bf.shelves.find(x => x.code === sh.code);
    if (bs) bs.entries = clone(sh.entries);
    toast(t('mapEditor.toast.saved', { label: sh.code }));
    renderShelf(); decorateMap();                     // entry is re-rendered FROM the saved state → it persists
  }
  function discardShelf(sh) {
    const bf = S.baseline.find(f => f.id === S.floorId);
    const bs = bf.shelves.find(x => x.code === sh.code);
    sh.entries = bs ? clone(bs.entries) : [];
    renderShelf(); decorateMap();
  }

  /* ---------- reassign (move) ---------- */
  function enterReassign(opts) {
    S.reassign = opts.orphan
      ? { orphan: opts.orphan, fromCode: null, fromFloor: S.floorId }
      : { entry: opts.entry, fromCode: opts.fromCode, fromFloor: S.floorId };
    S.mode = 'reassign';
    sync();
  }
  function cancelReassign() {
    const r = S.reassign; S.reassign = null;
    if (r && r.orphan) { S.mode = 'triage'; }
    else if (r && r.fromCode) { S.mode = 'shelf'; S.selected = r.fromCode; S.floorId = r.fromFloor; }
    else { S.mode = 'idle'; }
    sync();
  }
  function confirmTarget(code) {
    const r = S.reassign; if (!r) return;
    const destFloor = floor();
    const dest = shelf(code, destFloor);
    if (!dest) return;
    let moved;
    if (r.orphan) {
      moved = { id: newId(), col: r.orphan.col, from: r.orphan.from, to: r.orphan.to, _new: true };
      const srcFloor = S.data.find(f => f.id === r.fromFloor);
      srcFloor.orphans = (srcFloor.orphans || []).filter(o => o.id !== r.orphan.id);
    } else {
      // remove from source shelf (possibly on another floor)
      const srcFloor = S.data.find(f => f.id === r.fromFloor);
      const srcShelf = srcFloor.shelves.find(x => x.code === r.fromCode);
      moved = r.entry;
      if (srcShelf) srcShelf.entries = srcShelf.entries.filter(x => x.id !== r.entry.id);
    }
    dest.entries.push(moved);
    const crossFloor = r.fromFloor !== destFloor.id;
    S.reassign = null; S.mode = 'shelf'; S.selected = code;
    if (crossFloor) toast(t('mapEditor.toast.moved', { label: code, floor: destFloor.id }));
    else toast(t('mapEditor.toast.movedSame', { label: code }));
    sync();
  }

  /* ---------- navigation ---------- */
  function selectShelf(code) {
    if (S.mode === 'reassign') {
      if (S.reassign && S.reassign.fromCode === code) return; // can't move onto itself
      return confirmTarget(code);
    }
    S.selected = code; S.mode = 'shelf'; sync();
  }
  function clickBackground() {
    if (S.mode === 'reassign') return;
    if (S.mode === 'shelf' || S.mode === 'triage') { S.mode = 'idle'; S.selected = null; sync(); }
  }
  function switchFloor(id) {
    S.floorId = id;
    if (S.mode === 'reassign') { renderChrome(); renderMap(); decorateMap(); return; } // keep picking, re-arm
    S.mode = 'idle'; S.selected = null; sync();
  }

  /* ---------- toasts ---------- */
  function toast(msg) {
    const wrap = $('#toasts');
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
  }

  /* ---------- master sync ---------- */
  function sync() { renderChrome(); renderMap(); renderPanel(); }

  /* ---------- collapse ---------- */
  function toggleCollapse() {
    const split = $('#map-split'); split.classList.toggle('is-collapsed');
    const b = $('#collapse-btn');
    b.textContent = split.classList.contains('is-collapsed') ? '⟩' : '⟨';
    b.title = split.classList.contains('is-collapsed') ? t('panel.expand') : t('panel.collapse');
  }

  /* ---------- reset ---------- */
  function resetAll() {
    S.data = clone(S.seed); S.baseline = clone(S.seed);
    S.mode = 'idle'; S.selected = null; S.reassign = null;
    sync(); toast(t('mapEditor.toast.reset'));
    if (window.FB) FB.clearSilent();
  }

  /* ============================ INIT ============================ */
  async function init() {
    // switchers
    ['a', 'b', 'c'].forEach(k => $('#style-' + k).onclick = () => { S.theme = k; renderChrome(); });
    $('#lang-toggle').onclick = () => { S.lang = S.lang === 'he' ? 'en' : 'he'; sync(); };
    $('#reset-btn').onclick = resetAll;
    $('#help-btn').onclick = () => HELP.open();
    $('#collapse-btn').onclick = toggleCollapse;
    $('#reassign-strip').querySelector('button').onclick = cancelReassign;

    // map click delegation — bind to the REAL shelf elements (data-map-object="shelf")
    $('#map-canvas').addEventListener('click', ev => {
      const el = ev.target.closest('[data-map-object="shelf"]');
      if (el && el.id) selectShelf(el.id); else clickBackground();
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { if (S.mode === 'reassign') cancelReassign(); else if (S.mode === 'shelf' || S.mode === 'triage') { S.mode = 'idle'; S.selected = null; sync(); } }
    });

    FB.init(() => ({ style: t('style.' + S.theme), styleKey: S.theme, lang: S.lang }));
    HELP.init();
    renderChrome();   // topbar visible immediately while the floor SVGs load

    // load the three real floor SVGs (duplicated into this folder) + seed sample data
    const loaded = await Promise.all(FLOOR_META.map(m =>
      window.FloorSvg.loadFloorAssets(m.id).then(a => [m.id, a]).catch(() => [m.id, { svg: '', codes: [] }])));
    const assets = Object.fromEntries(loaded);
    S.seed = buildFloors(assets); S.data = clone(S.seed); S.baseline = clone(S.seed);

    sync();
    if (!localStorage.getItem('mock-help-seen')) { HELP.open(); localStorage.setItem('mock-help-seen', '1'); }
  }

  window.APP = { init, getContext: () => ({ styleKey: S.theme, style: t('style.' + S.theme), lang: S.lang }), t };
  document.addEventListener('DOMContentLoaded', init);
})();
