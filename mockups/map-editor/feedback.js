/* ------------------------------------------------------------------
 * Map Editor mockup — feedback ("bundle" approach, no backend).
 * Comments + screenshots are captured in the browser (localStorage),
 * then EXPORTED as one self-contained .html file the tester emails to us.
 * Nothing is transmitted automatically.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';
  const STR = window.MOCK.STR;
  const EMAIL = window.MOCK.FEEDBACK_EMAIL;
  const KEY = 'mock-feedback-notes-v1';
  const $ = (s, r = document) => r.querySelector(s);
  const lang = () => document.documentElement.lang || 'he';
  function t(k, v) { let s = (STR[lang()] && STR[lang()][k]) != null ? STR[lang()][k] : k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  let notes = [];
  let shots = [];            // data-URLs being composed for the current note
  let getCtx = () => ({ style: '', styleKey: '', lang: lang() });

  const TOPICS = ['map', 'panel', 'fields', 'look', 'wording', 'general'];

  function load() { try { notes = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { notes = []; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch { /* quota */ } }

  /* ---------- labels (called on every lang/theme render) ---------- */
  function relabel() {
    const set = (id, key) => { const el = $('#' + id); if (el) el.textContent = t(key); };
    set('fab-feedback', 'fb.fab');
    set('fb-title', 'fb.title');
    set('fb-intro', 'fb.intro');
    set('fb-style-label', 'fb.style');
    set('fb-topic-label', 'fb.topic');
    set('fb-comment-label', 'fb.comment');
    set('fb-screenshot-label', 'fb.screenshot');
    set('fb-add', 'fb.add');
    set('fb-list-title', 'fb.list.title');
    set('fb-export', 'fb.export');
    set('fb-copy', 'fb.copy');
    set('fb-clear', 'fb.clear');
    const ta = $('#fb-comment'); if (ta) ta.placeholder = t('fb.comment.ph');
    const dz = $('#fb-dropzone-text'); if (dz) dz.textContent = t('fb.screenshot.hint');
    // topic options
    const sel = $('#fb-topic');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = TOPICS.map(tp => `<option value="${tp}">${esc(t('fb.topic.' + tp))}</option>`).join('');
      if (cur) sel.value = cur;
    }
    const ctx = getCtx();
    const sp = $('#fb-style-pill'); if (sp) sp.textContent = ctx.style || '';
    renderList();
  }

  /* ---------- compose ---------- */
  function renderThumbs() {
    const wrap = $('#fb-thumbs'); if (!wrap) return;
    wrap.innerHTML = shots.map((d, i) =>
      `<div class="thumb"><img src="${d}" alt=""><button data-rm="${i}" title="remove">×</button></div>`).join('');
    wrap.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { shots.splice(+b.dataset.rm, 1); renderThumbs(); });
  }
  function addFiles(files) {
    [...files].filter(f => f.type.startsWith('image/')).forEach(f => {
      const r = new FileReader();
      r.onload = () => { shots.push(r.result); renderThumbs(); };
      r.readAsDataURL(f);
    });
  }
  function addNote() {
    const comment = $('#fb-comment').value.trim();
    if (!comment && !shots.length) { $('#fb-comment').focus(); return; }
    const ctx = getCtx();
    notes.unshift({
      ts: new Date().toISOString(),
      tsLabel: new Date().toLocaleString(),
      style: ctx.style, styleKey: ctx.styleKey, lang: ctx.lang,
      topic: $('#fb-topic').value, topicLabel: t('fb.topic.' + $('#fb-topic').value),
      comment, shots: shots.slice(),
    });
    shots = []; $('#fb-comment').value = ''; renderThumbs(); persist(); renderList();
  }

  function renderList() {
    const wrap = $('#fb-list'); if (!wrap) return;
    if (!notes.length) { wrap.innerHTML = `<div class="empty-list">${esc(t('fb.list.empty'))}</div>`; return; }
    wrap.innerHTML = notes.map((n, i) => `
      <div class="note-item">
        <button class="del" data-del="${i}">${esc(t('fb.remove'))}</button>
        <div class="tags">
          <span class="tag">${esc(n.style)}</span>
          <span class="tag muted">${esc(n.topicLabel || n.topic)}</span>
          <span class="tag muted">${esc(n.lang === 'he' ? 'עברית' : 'EN')}</span>
        </div>
        ${n.comment ? `<div class="body">${esc(n.comment)}</div>` : ''}
        ${n.shots && n.shots.length ? `<div class="shots">${n.shots.map(s => `<img src="${s}" alt="">`).join('')}</div>` : ''}
      </div>`).join('');
    wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { notes.splice(+b.dataset.del, 1); persist(); renderList(); });
  }

  /* ---------- export bundle ---------- */
  function buildReport() {
    const rows = notes.map((n, i) => `
      <article>
        <header>#${notes.length - i} · <b>${esc(n.style)}</b> · ${esc(n.topicLabel || n.topic)} · ${esc(n.lang)} · <span class="ts">${esc(n.tsLabel)}</span></header>
        ${n.comment ? `<p>${esc(n.comment).replace(/\n/g, '<br>')}</p>` : '<p class="none">(no text)</p>'}
        ${n.shots && n.shots.length ? `<div class="shots">${n.shots.map(s => `<img src="${s}">`).join('')}</div>` : ''}
      </article>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Map Editor mockup — feedback</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#1e293b;background:#f8fafc}
  h1{font-size:1.4rem;margin:0 0 4px} .meta{color:#64748b;margin:0 0 24px;font-size:.9rem}
  article{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin:0 0 16px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  header{font-size:.82rem;color:#475569;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:8px}
  header b{color:#2563eb} .ts{color:#94a3b8}
  p{margin:8px 0;white-space:pre-wrap} p.none{color:#94a3b8;font-style:italic}
  .shots{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
  .shots img{max-width:340px;border:1px solid #e5e7eb;border-radius:8px}
</style></head><body>
<h1>Map Editor mockup — feedback</h1>
<p class="meta">${notes.length} note(s) · exported ${esc(new Date().toLocaleString())} · from the design preview</p>
${rows || '<p>(no notes)</p>'}
</body></html>`;
  }
  function exportBundle() {
    if (!notes.length) { toast(t('fb.list.empty')); return; }
    const date = new Date().toISOString().slice(0, 10);
    const fname = `map-editor-feedback-${date}.html`;
    const blob = new Blob([buildReport()], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    const subject = encodeURIComponent('Map Editor mockup — my feedback');
    const body = encodeURIComponent(
      `Hi,\n\nMy feedback on the map editor design preview is in the file that just downloaded:\n  ${fname}\n\nPlease find it attached. (${notes.length} note(s).)\n\nThanks!`);
    setTimeout(() => { window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`; }, 400);
    toast(t('fb.exported'));
  }
  function copyText() {
    if (!notes.length) { toast(t('fb.list.empty')); return; }
    const txt = notes.map((n, i) => `#${notes.length - i} [${n.style} · ${n.topicLabel || n.topic} · ${n.lang}] ${n.tsLabel}\n${n.comment || '(no text)'}${n.shots && n.shots.length ? `\n(${n.shots.length} screenshot(s) — see exported file)` : ''}`).join('\n\n');
    navigator.clipboard?.writeText(txt).then(() => toast(t('fb.copied')), () => toast(t('fb.copied')));
  }
  function clearAll(silent) {
    notes = []; shots = []; persist();
    const c = $('#fb-comment'); if (c) c.value = '';
    renderThumbs(); renderList();
    if (!silent) toast(t('fb.list.empty'));
  }

  /* tiny toast (reuses #toasts) */
  function toast(msg) {
    const wrap = $('#toasts'); if (!wrap) return;
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; wrap.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
  }

  /* ---------- open/close ---------- */
  function open() { relabel(); $('#fb-overlay').classList.add('is-open'); }
  function close() { $('#fb-overlay').classList.remove('is-open'); }

  function init(ctxFn) {
    if (ctxFn) getCtx = ctxFn;
    load();
    $('#fab-feedback').onclick = open;
    $('#fb-close').onclick = close;
    $('#fb-overlay').addEventListener('click', e => { if (e.target.id === 'fb-overlay') close(); });
    $('#fb-add').onclick = addNote;
    $('#fb-export').onclick = exportBundle;
    $('#fb-copy').onclick = copyText;
    $('#fb-clear').onclick = () => clearAll(false);

    const dz = $('#fb-dropzone'), input = $('#fb-file');
    dz.onclick = () => input.click();
    input.onchange = () => { addFiles(input.files); input.value = ''; };
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-drag'); }));
    dz.addEventListener('drop', e => addFiles(e.dataTransfer.files));

    renderThumbs(); renderList();
  }

  window.FB = { init, relabel, open, close, clearSilent: () => clearAll(true) };
})();

/* ----------------------------- HELP ----------------------------- */
(function () {
  'use strict';
  const STR = window.MOCK.STR;
  const $ = (s) => document.querySelector(s);
  const lang = () => document.documentElement.lang || 'he';
  const t = (k) => (STR[lang()] && STR[lang()][k] != null) ? STR[lang()][k] : k;

  function fill() {
    const set = (id, key) => { const el = $('#' + id); if (el) el.textContent = t(key); };
    set('help-title', 'help.title'); set('help-lead', 'help.p1');
    set('help-s1-t', 'help.s1.t'); set('help-s1-d', 'help.s1.d');
    set('help-s2-t', 'help.s2.t'); set('help-s2-d', 'help.s2.d');
    set('help-s3-t', 'help.s3.t'); set('help-s3-d', 'help.s3.d');
    set('help-close', 'help.close');
  }
  function open() { fill(); $('#help-overlay').classList.add('is-open'); }
  function close() { $('#help-overlay').classList.remove('is-open'); }
  function init() {
    $('#help-close').onclick = close;
    $('#help-overlay').addEventListener('click', e => { if (e.target.id === 'help-overlay') close(); });
  }
  window.HELP = { init, open, close };
})();
