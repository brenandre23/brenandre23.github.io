// showcase.js: the "Five priorities" and "Major initiatives" bands of portfolio.html.
// Infographics first, words second. Numbers come from data.js / print-maps.js through portfolioFacts() (charts.js).
// Colours: categorical slots 1-3 of the validated dataviz palette, dark-surface steps. Text never wears a series colour.
(() => {
const SER = ['#3987e5', '#d95926', '#199e70'];
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Inline icons (24px, stroke). Shapes only, no brand marks.
const ICON = {
  layers: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/><path d="m2 17.5 10 5 10-5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.5 6.5 2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/>',
  grid: '<path d="M3 7h18M3 12h18M3 17h18M8 3v18M16 3v18"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2"/>'
};
const icon = (k, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ICON.map}</svg>`;
const count = (n, extra = '') => `<span class="num" data-count="${n}">${REDUCE ? n : 0}</span>${extra}`;

// ---------------------------------------------------------------- small infographics (SVG / HTML, no library)
function stackBar(parts, total) {
  return `<div class="stack" role="img" aria-label="${e(parts.map(p => `${p.n} ${p.label}`).join(', '))}">
    ${parts.map((p, i) => `<span class="seg" style="--w:${(100 * p.n / total).toFixed(2)}%;--c:${p.c}" title="${e(p.label)}: ${p.n}"></span>`).join('')}</div>
    <ul class="key">${parts.map(p => `<li><i style="--c:${p.c}"></i><b>${p.n}</b> ${e(p.label)}</li>`).join('')}</ul>`;
}
function monthBars(rows) {
  const max = Math.max(...rows.map(r => r.n)), W = 300, H = 92, gap = 10, bw = (W - gap * (rows.length - 1)) / rows.length;
  const bars = rows.map((r, i) => {
    const h = Math.max(3, (r.n / max) * (H - 26)), x = i * (bw + gap), y = H - 18 - h;
    return `<g class="mb" style="--d:${i * 70}ms"><title>${e(r.label)}: ${r.n} print maps</title>
      <path d="M${x},${H - 18} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z" fill="${SER[0]}"/>
      <text x="${x + bw / 2}" y="${y - 5}" class="v">${r.n}</text><text x="${x + bw / 2}" y="${H - 3}" class="l">${e(r.label)}</text></g>`;
  }).join('');
  return `<svg class="months" viewBox="0 0 ${W} ${H}" role="img" aria-label="Print maps by month: ${e(rows.map(r => `${r.label} ${r.n}`).join(', '))}">${bars}</svg>`;
}
function waffle(groups) {
  const cells = groups.flatMap(g => Array.from({length: g.n}, () => g.c));
  return `<div class="waffle" role="img" aria-label="${e(groups.map(g => `${g.n} ${g.label}`).join(', '))}">
    ${cells.map((c, i) => `<i style="--c:${c};--d:${i * 22}ms"></i>`).join('')}</div>
    <ul class="key">${groups.map(g => `<li><i style="--c:${g.c}"></i><b>${g.n}</b> ${e(g.label)}</li>`).join('')}</ul>`;
}
function hbars(rows) {
  const max = Math.max(...rows.map(r => r.n));
  return `<ul class="hbars">${rows.map((r, i) => `<li><span class="hl">${e(r.label)}</span>
    <span class="ht"><span class="hb" style="--w:${(100 * r.n / max).toFixed(1)}%;--d:${i * 60}ms"></span></span><b>${r.n}</b></li>`).join('')}</ul>`;
}
const status = (kind, text) => `<span class="st st-${kind}">${kind === 'ok' ? '✓' : kind === 'prog' ? '◐' : '◔'} ${e(text)}</span>`;

// ---------------------------------------------------------------- Journey (career timeline; no pay information)
const JOURNEY = [
  {when: '2019', what: 'Intern', detail: 'World Bank Cartography', ic: 'map'},
  {when: '2019 – 2022', what: 'Part-time with the Bank', detail: 'BA in Human Environment; minors in Political Science and Geospatial Technologies', ic: 'layers'},
  {when: 'After 2022', what: 'Consultant, year-round', detail: 'Through International Mapping Associates, alongside other work', ic: 'users'},
  {when: 'Master’s', what: 'Erasmus Mundus Joint Master’s', detail: 'Geospatial Technologies, across leading European GIS universities; graduated top of the class', ic: 'spark'},
  {when: 'May 2026', what: 'Full time with the Bank', detail: 'Cartography Unit, Global Corporate Solutions', ic: 'bolt', key: true},
  {when: 'June 2026', what: 'Five priorities agreed', detail: 'Productivity, interactive applications, partnerships, project management, AI adoption', ic: 'shield', key: true, href: '#priorities-title'},
  {when: 'Nov 2026', what: 'Delivered', detail: 'Production at volume, plus applications, self-service, reusable tools and AI capacity', ic: 'flask', key: true, href: '#initiatives-title'}
];
window.renderJourney = function () {
  const el = $('journey'); if (!el) return;
  el.innerHTML = JOURNEY.map((j, i) => `<li class="jn reveal${j.key ? ' is-key' : ''}" style="--i:${i}">
    <span class="jn-dot">${icon(j.ic, 'ico sm')}</span>
    <p class="jn-when">${e(j.when)}</p><h3>${j.href ? `<a href="${e(j.href)}">${e(j.what)}</a>` : e(j.what)}</h3><p class="jn-detail">${e(j.detail)}</p></li>`).join('');
  activate(el.parentElement);
};

// ---------------------------------------------------------------- Five priorities
window.renderPrioritiesShowcase = function (f) {
  const P = window.PORTFOLIO, PM = window.PRINT_MAPS || [];
  const byMonth = {}; PM.forEach(p => { const k = (p.date || '').slice(0, 7); if (k) byMonth[k] = (byMonth[k] || 0) + 1; });
  const months = Object.keys(byMonth).sort().map(k => ({label: MON[+k.slice(5, 7) - 1] + (k.endsWith('-08') ? '*' : k.endsWith('-10') ? '†' : ''), n: byMonth[k]}));
  const areas = {}; PM.forEach(p => { areas[p.area] = (areas[p.area] || 0) + 1; });
  const countryRows = Object.entries(areas).filter(([a]) => !/World|Africa|Asia|Pacific|Europe/.test(a)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, n]) => ({label, n}));
  const pr = Object.fromEntries(P.priorities.map(p => [p.id, p]));
  const links = p => `<p class="go">${p.evidence.map(([l, h]) => `<a href="${e(h)}">${e(l)} <span aria-hidden="true">→</span></a>`).join('')}</p>`;
  const head = (n, p, ic) => `<header class="ph"><span class="badge">${n}</span>${icon(ic)}<h3>${e(p.title)}</h3></header>`;

  const cards = [
    `<article class="pc pc-1 reveal">${head(1, pr.productivity, 'bolt')}
      <div class="pc-body two">
        <div><p class="mega">${count(f.deliverables)}</p><p class="cap">deliverables in <b>${f.hours}</b> hours · about <b>${f.perDeliverable}</b> hours each</p>
          ${stackBar([{n: f.print, label: 'print and report maps', c: SER[0]}, {n: f.interactive, label: 'interactive maps and dashboards', c: SER[1]}], f.deliverables)}</div>
        <figure class="mini"><figcaption>Print maps by month last worked on</figcaption>${monthBars(months)}<p class="fn">* two weeks of leave · † to 6 October</p></figure>
      </div>
      <ul class="pts"><li>${e(f.print)} print and report maps in ${e(f.series)} series</li><li>Automated production pipelines, and training the team to use them</li></ul>${links(pr.productivity)}</article>`,

    `<article class="pc pc-2 reveal">${head(2, pr.interactive, 'map')}
      <p class="mega">${count(f.interactive)}</p><p class="cap">interactive maps and dashboards, live</p>
      ${waffle([{n: f.dashboards, label: 'dashboards', c: SER[0]}, {n: f.webmaps, label: 'interactive and Flourish maps', c: SER[1]}, {n: f.prototypes, label: 'prototypes', c: SER[2]}])}
      <ul class="pts"><li>Built to travel: ICSID in English, French and Spanish; an embeddable Tourism Watch view</li></ul>${links(pr.interactive)}</article>`,

    `<article class="pc pc-3 reveal">${head(3, pr.partnerships, 'users')}
      <div class="duo"><div><p class="mega sm">${count(f.projects)}</p><p class="cap">client workstreams</p></div><div><p class="mega sm">${count(f.areas)}</p><p class="cap">countries and regions</p></div></div>
      <p class="sub">Most-mapped countries</p>${hbars(countryRows)}${links(pr.partnerships)}</article>`,

    `<article class="pc pc-4 reveal">${head(4, pr.management, 'shield')}
      <p class="mega sm">3<span class="plus">+</span>2</p><p class="cap">secure self-service tracks · GeoAI proofs of concept</p>
      <ul class="tracks">
        <li><b>Esri</b><span>Viewer · Survey123 collector · editor</span>${status('ok', 'Working')}</li>
        <li><b>IMA Sync Server</b><span>Angola transport map</span>${status('ok', 'Working version')}</li>
        <li><b>Azure API</b><span>With ITS · credentials on the server</span>${status('prog', 'In progress')}</li>
      </ul>
      <p class="chips2"><span>Ageospatial · roads</span><span>CARTO · transport assistant</span></p>${links(pr.management)}</article>`,

    `<article class="pc pc-5 reveal">${head(5, pr.ai, 'spark')}
      <p class="mega sm">${count(7, '+')}</p><p class="cap">internal AI sessions for the team</p>
      <p class="callout">${icon('key', 'ico sm')}<span><b>mAI API key</b> for the department’s research and development, with ITS</span></p>
      <div class="tiles"><div><b>~120</b><span>checks per map</span></div><div><b>14</b><span>map presets</span></div><div><b>~300</b><span>datasets for AI agents</span></div></div>
      ${links(pr.ai)}</article>`
  ];
  $('priorities').innerHTML = cards.map(c => `<li>${c}</li>`).join('');
  activate($('priorities'));
};

// ---------------------------------------------------------------- Major initiatives
const INI = {
  'map-builder': {span: 7, ic: 'layers', img: 'static/builder.jpg', tag: 'Platform', facts: [['~120', 'automated checks per map'], ['9', 'guided steps'], ['14', 'presets']]},
  'ai': {span: 5, open: true, ic: 'spark', tag: 'Enablement', facts: [['7+', 'sessions'], ['mAI', 'API key with ITS'], ['~300', 'datasets for agents']]},
  'platform': {span: 7, ic: 'shield', tag: 'Self-service', facts: [['3', 'tracks'], ['3', 'Esri apps working'], ['1', 'Azure API with ITS']]},
  'pocs': {span: 5, ic: 'flask', img: 'thumbs/25.jpg', tag: 'GeoAI', facts: [['2', 'vendors'], ['5', 'evaluation criteria']]},
  'training': {ic: 'play', tag: 'Knowledge sharing', facts: []},
  'boundaries': {ic: 'grid', tag: 'Data stewardship', facts: []},
  'automation': {ic: 'bolt', tag: 'Capacity', facts: []}
};
const APP_DESC = {
  'Map Viewer': 'Project components and corridors, with routing, geolocation and satellite or topographic basemaps.',
  'Data Collection App (Survey123)': 'Structured observations with categories, metadata and photos, on regions, points and lines.',
  'Map Editor': 'Edit survey observations and existing data such as railways and border crossings; changes show live.'
};
window.renderInitiativesShowcase = function () {
  const P = window.PORTFOLIO, byId = new Map(P.maps.map(m => [m.id, m]));
  $('initiatives').innerHTML = P.initiatives.map((x, i) => {
    const meta = INI[x.id] || {ic: 'map', facts: []}, feature = !!meta.img || x.id === 'platform';
    const appTiles = x.id === 'platform' && x.links?.length;
    const linkHtml = appTiles
      ? `<div class="apps">${x.links.map(([l, h]) => `<a class="app" href="${e(h)}" target="_blank" rel="noopener"><b>${e(l)} <span aria-hidden="true">↗</span></b><span>${e(APP_DESC[l] || '')}</span></a>`).join('')}</div>`
      : (x.links || []).map(([l, h, note]) => `<p class="cta"><a href="${e(h)}" target="_blank" rel="noopener">${e(l)} <span aria-hidden="true">↗</span></a>${note ? `<span>${e(note)}</span>` : ''}</p>`).join('');
    // The platform card keeps its track summary short: the three apps carry the Esri detail.
    const points = x.id === 'platform' ? x.points.map(p => p.replace(/^(Track 2, Esri: three working apps[^.]*\.).*$/, '$1')) : x.points;
    return `<article class="ini reveal${feature ? ' feature' : ''}" id="initiative-${e(x.id)}" style="--i:${i};grid-column:span ${meta.span || 4}">
      ${meta.img ? `<div class="ini-img"><img src="${e(meta.img)}" alt="" loading="lazy"></div>` : ''}
      <div class="ini-body">
        <header><span class="ini-ic">${icon(meta.ic)}</span><div><p class="tag">${e(meta.tag || '')}</p><h3>${e(x.title)}</h3></div></header>
        <p class="sum">${e(x.summary)}</p>
        ${meta.facts.length ? `<div class="facts">${meta.facts.map(([n, l]) => `<div><b>${e(n)}</b><span>${e(l)}</span></div>`).join('')}</div>` : ''}
        ${linkHtml}
        ${points.length ? `<details${meta.open || !meta.img && x.id !== 'platform' ? ' open' : ''}><summary>${points.length === 1 ? 'Detail' : `${points.length} details`}</summary><ul>${points.map(p => `<li>${e(p)}</li>`).join('')}</ul></details>` : ''}
        ${x.maps.length ? `<p class="see"><span>See it live:</span>${x.maps.map(id => `<button type="button" data-map="${e(id)}">${e(byId.get(id)?.title || id)}</button>`).join('')}</p>` : ''}
      </div></article>`;
  }).join('');
  activate($('initiatives'));
};

// ---------------------------------------------------------------- motion: reveal, count-up, pointer glow
function activate(root) {
  root.querySelectorAll('.pc, .ini').forEach(card => card.addEventListener('pointermove', ev => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${ev.clientX - r.left}px`); card.style.setProperty('--my', `${ev.clientY - r.top}px`);
  }));
  const els = root.querySelectorAll('.reveal');
  if (REDUCE || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in'); io.unobserve(en.target);
    en.target.querySelectorAll('.num[data-count]').forEach(n => {
      const to = +n.dataset.count, t0 = performance.now(), dur = 1100;
      const step = now => { const k = Math.min(1, (now - t0) / dur); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }), {threshold: 0.18});
  els.forEach(el => io.observe(el));
}
})();
