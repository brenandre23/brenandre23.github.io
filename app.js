// app.js — renders data.js. One live map at a time (the viewer); the gallery shows thumbnails.
const P = window.PORTFOLIO, PM = window.PRINT_MAPS || [], $ = id => document.getElementById(id);
const TYPES = ['Dashboard', 'Interactive map', 'Flourish map', 'Prototype / explorer'];
const byId = new Map(P.maps.map(m => [m.id, m]));
const embedUrl = m => /flourish\.studio\/visualisation\/\d+\/?$/.test(m.url) ? m.url.replace(/\/?$/, '/embed') : m.url;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = d => { const [y, m, day] = d.split('-'); return (day ? +day + ' ' : '') + (m ? MONTHS[m - 1] + ' ' : '') + y; };
let type = 'all', query = '', current = null;

function shown() {
  const q = query.trim().toLowerCase();
  return P.maps.filter(m => (type === 'all' || m.type === type) && (!q || `${m.title} ${m.ws} ${m.type}`.toLowerCase().includes(q)));
}

function renderHeader() {
  $('eyebrow').textContent = `${P.unit} · ${P.period}`;
  $('lede').textContent = `${P.owner}: the interactive maps and dashboards, live; the print and report maps; and the major initiatives behind them.`;
  const count = t => P.maps.filter(m => m.type === t).length;
  $('chips').innerHTML = [['all', 'All', P.maps.length], ...TYPES.map(t => [t, t, count(t)])]
    .map(([v, label, n]) => `<button type="button" data-type="${esc(v)}" aria-pressed="${v === type}">${esc(label)} <span class="n">${n}</span></button>`).join('');
}

function renderGallery() {
  const list = shown(), items = [...list, ...(type === 'all' && !query ? P.pending.map(p => ({...p, pending: true})) : [])];
  $('count').textContent = `${list.length} of ${P.maps.length} shown`;
  $('gallery').innerHTML = items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<p class="meta">Nothing matches. Clear the search or pick another type.</p>';
}

function card(m) {
  if (m.pending) return `<div class="card panel pending"><div class="thumb">${m.count || ''} maps · links pending</div><div class="body"><span class="ws-label">${esc(m.ws)}</span><span class="title">${esc(m.title)}</span><span class="type">${esc(m.note)}</span></div></div>`;
  return `<button type="button" class="card" data-map="${esc(m.id)}" aria-current="${m.id === current}">
    ${m.thumb ? `<img class="thumb" src="${esc(m.thumb)}" alt="" loading="lazy">` : `<span class="thumb none" aria-hidden="true">No preview</span>`}
    <span class="body"><span class="ws-label">${esc(m.ws)}</span><span class="title">${esc(m.title)}</span><span class="type">${esc(m.type)}${m.date ? ' · ' + esc(fmtDate(m.date)) : ''}${m.embed === false ? ' · opens in a new tab' : ''}</span></span></button>`;
}

function select(id, {scroll = false} = {}) {
  const m = byId.get(id) || P.maps[0];
  current = m.id;
  if (byId.has(id) && location.hash !== '#' + m.id) history.replaceState(null, '', '#' + m.id);
  $('viewer-ws').textContent = m.ws;
  $('viewer-title').textContent = m.title;
  $('viewer-meta').textContent = [m.type, m.date && fmtDate(m.date)].filter(Boolean).join(' · ');
  $('open').href = m.url;
  $('stage').innerHTML = m.embed === false
    ? `<div class="fallback"${m.thumb ? ` style="background-image:url('${esc(m.thumb)}')"` : ''}><div class="note"><p><strong>${esc(m.title)}</strong> can’t be shown inside another page: its site doesn’t allow it.</p><a class="button primary" href="${esc(m.url)}" target="_blank" rel="noopener">Open it in a new tab ↗</a></div></div>`
    : `<iframe src="${esc(embedUrl(m))}" title="${esc(m.title)} (live)" allow="fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  $('stage').nextElementSibling?.classList.contains('stage-note') && $('stage').nextElementSibling.remove();
  if (m.note) $('stage').insertAdjacentHTML('afterend', `<p class="stage-note">${esc(m.note)}</p>`);
  const list = shown(), i = list.findIndex(x => x.id === m.id);
  $('prev').disabled = i <= 0; $('next').disabled = i < 0 || i >= list.length - 1;
  for (const c of document.querySelectorAll('.card[data-map]')) c.setAttribute('aria-current', String(c.dataset.map === m.id));
  if (scroll) document.querySelector('.viewer').scrollIntoView({block: 'start'});
}

function step(d) { const list = shown(), i = list.findIndex(x => x.id === current); if (list[i + d]) select(list[i + d].id); }

function renderTimeline() {
  const items = [...P.maps.map(m => ({...m, kind: 'map'})), ...P.pending, ...P.initiatives.map(x => ({...x, kind: 'initiative'}))].filter(x => x.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  $('timeline-section').hidden = !items.length;
  $('timeline').innerHTML = items.map(x => `<li><time datetime="${esc(x.date)}">${esc(fmtDate(x.date))}</time><br>${x.kind === 'map'
    ? `<button type="button" class="link-like" data-map="${esc(x.id)}">${esc(x.title)}</button> <span class="meta">${esc(x.ws)}</span>` : `<strong>${esc(x.title)}</strong>`}</li>`).join('');
}

function renderPriorities() {
  const f = portfolioFacts();
  $('priorities-intro').textContent = P.prioritiesIntro;
  $('priorities').innerHTML = P.priorities.map((p, i) => `<li class="panel priority">
    <p class="eyebrow">Priority ${i + 1}</p><h3>${esc(p.title)}</h3>
    <p class="stat"><strong>${esc(fill(p.stat, f))}</strong><span>${esc(fill(p.statLabel, f))}</span></p>
    <ul>${p.points.slice(0, 2).map(x => `<li>${esc(fill(x, f))}</li>`).join('')}</ul>
    <p class="evidence">${p.evidence.map(([label, href]) => `<a href="${esc(href)}">${esc(label)} →</a>`).join('')}</p>
  </li>`).join('');
}

function renderInitiatives() {
  $('initiatives').innerHTML = P.initiatives.map(x => `<article class="panel initiative" id="initiative-${esc(x.id)}">
    <h3>${esc(x.title)}</h3>${x.date ? `<p class="meta">${esc(fmtDate(x.date))}</p>` : ''}<p>${esc(x.summary)}</p>
    ${x.points.length ? `<ul>${x.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${x.links?.length ? `<div class="related links">${x.links.map(([label, href, note]) => `<a class="button" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ↗</a>${note ? `<span class="meta">${esc(note)}</span>` : ''}`).join('')}</div>` : ''}
    ${x.maps.length ? `<div class="related"><span class="meta">See it:</span>${x.maps.map(id => `<button type="button" data-map="${esc(id)}">${esc(byId.get(id)?.title || id)}</button>`).join('')}</div>` : ''}
  </article>`).join('');
}

function renderFooter() {
  $('footer').innerHTML = `<p>Compiled from: ${[...P.sources, 'SSA49630.zip (print maps)'].map(esc).join(' · ')}. Updated ${esc(fmtDate(P.updated))}.</p>
    <p>Maps load live from their own servers; one map is loaded at a time. Thumbnails are screenshots taken on ${esc(fmtDate(P.updated))}.</p>`;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-type]'), m = e.target.closest('[data-map]'), card = e.target.closest('[data-print]');
  if (t) { type = t.dataset.type; renderHeader(); renderGallery(); select(current); }
  else if (m) select(m.dataset.map, {scroll: true});
  else if (card) openPrint(card.dataset.print);
});
$('search').addEventListener('input', e => { query = e.target.value; renderGallery(); select(current); });
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (byId.has(id) && id !== current) select(id, {scroll: true}); });

// ---- Print and report maps --------------------------------------------------------------------------------------
const pf = {q: '', series: '', area: '', day: ''};
const GENERIC = ['World thematic maps', 'Regional reference maps', 'Africa regional'];   // listed after the named series
let printShown = [], lbIndex = -1, printAll = false;
const PAGE = 15;   // print maps shown before "Show all"
function printFiltered() {
  // Terms match from the start of a word, so "8 June" finds 8 June, not the "…68 JUNE" of a stamp.
  const q = pf.q.trim() && new RegExp('(^|[\\s(:,·])' + pf.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return PM.filter(m => (!pf.series || m.series === pf.series) && (!pf.area || m.area === pf.area) && (!pf.day || m.date === pf.day)
    && (!q || q.test(`${m.title} ${m.code} ${m.series} ${m.area} ${m.stamp} ${m.date} ${fmtDate(m.date)}`)));
}
function setupPrint() {
  if (!PM.length) return;
  const dates = PM.map(m => m.date).sort();
  $('print-meta').textContent = `${PM.length} maps, ${fmtDate(dates[0])} to ${fmtDate(dates.at(-1))}. Dated by when each was last worked on (PDF metadata); ${PM.filter(m => m.original).length} are remakes of earlier maps. Open any map at full size or as its PDF.`;
  const opts = (vals, all) => `<option value="">${all}</option>` + [...new Set(vals)].sort().map(v => `<option>${esc(v)}</option>`).join('');
  $('print-series').innerHTML = opts(PM.map(m => m.series), 'All series');
  $('print-area').innerHTML = opts(PM.map(m => m.area), 'All countries and regions');
  $('print-series').onchange = e => { pf.series = e.target.value; renderPrint(); };
  $('print-area').onchange = e => { pf.area = e.target.value; renderPrint(); };
  $('print-search').oninput = e => { pf.q = e.target.value; renderPrint(); };
}
function renderPrint() {
  if (!PM.length) return;
  printShown = printFiltered();
  // Calendar heatmap: maps per day for the maps matching every filter except the day; click a day to filter to it.
  const base = PM.filter(m => (!pf.series || m.series === pf.series) && (!pf.area || m.area === pf.area)), perDay = {};
  for (const m of base) perDay[m.date] = (perDay[m.date] || 0) + 1;
  const dates = PM.map(m => m.date).sort(), el = $('print-chart'), thin = narrow(el);
  el.style.height = thin ? '640px' : '200px';
  const cal = chart(el, {
    tooltip: {formatter: p => `<b>${fmtDate(p.value[0])}</b><br>${p.value[1]} map${p.value[1] > 1 ? 's' : ''} last worked on`},
    visualMap: {type: 'piecewise', orient: 'horizontal', left: thin ? 0 : 'right', top: 0, itemGap: 10, textStyle: {color: WB.muted},
      pieces: [{min: 1, max: 1, label: '1', color: WB.pale}, {min: 2, max: 3, label: '2–3', color: '#6aaed6'}, {min: 4, max: 6, label: '4–6', color: WB.brand}, {min: 7, label: '7+', color: WB.brandDark}]},
    calendar: {range: [dates[0].slice(0, 7) + '-01', dates.at(-1)], orient: thin ? 'vertical' : 'horizontal', top: thin ? 64 : 50, left: thin ? 36 : 40, right: thin ? 8 : 10,
      cellSize: thin ? [Math.floor((el.clientWidth - 50) / 7), 'auto'] : ['auto', 18], splitLine: {lineStyle: {color: '#fff', width: 3}},
      itemStyle: {color: WB.page, borderColor: '#fff', borderWidth: 2}, yearLabel: {show: false},
      monthLabel: {color: WB.text, fontWeight: 600, nameMap: 'EN'}, dayLabel: {color: WB.muted, firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S']}},
    series: [{type: 'heatmap', coordinateSystem: 'calendar', data: Object.entries(perDay),
      itemStyle: {borderColor: '#fff', borderWidth: 2}, emphasis: {itemStyle: {borderColor: WB.text, borderWidth: 2}}}]
  }, `Calendar of print maps by day, ${fmtDate(dates[0])} to ${fmtDate(dates.at(-1))}. Busiest day: ${Object.entries(perDay).sort((a, b) => b[1] - a[1])[0]?.join(', ') || 'none'} maps.`);
  cal.off('click'); cal.on('click', p => { pf.day = pf.day === p.value[0] ? '' : p.value[0]; renderPrint(); });
  // Named series first (largest first), then the general world and regional groups; one continuous grid.
  const size = s => printShown.filter(m => m.series === s).length;
  printShown.sort((a, b) => GENERIC.includes(a.series) - GENERIC.includes(b.series) || size(b.series) - size(a.series) || a.series.localeCompare(b.series) || a.date.localeCompare(b.date));
  const filtered = pf.q || pf.series || pf.area || pf.day, visible = printAll || filtered ? printShown : printShown.slice(0, PAGE);
  $('print-count').textContent = `${visible.length < printShown.length ? `Showing ${visible.length} of ${printShown.length}` : `${printShown.length} of ${PM.length} shown`}${pf.day ? ` · ${fmtDate(pf.day)} only (click the day again to clear)` : ''}`;
  $('print-gallery').innerHTML = printShown.length ? `<div class="grid">${visible.map(m => `<button type="button" class="card" data-print="${esc(m.code)}">
      ${m.image === false ? `<span class="thumb none" aria-hidden="true">No preview</span>` : `<img class="thumb print" src="static/t/${esc(m.code)}.jpg" alt="" loading="lazy">`}
      <span class="body"><span class="ws-label">${esc(m.series)}</span><span class="title">${esc(m.title)}</span><span class="code">${esc(m.code)} · ${esc(m.area)} · ${esc(fmtDate(m.date))}${m.original ? ` · remade, first published ${esc(fmtDate(m.original))}` : ''}</span></span></button>`).join('')}</div>`
    + (visible.length < printShown.length ? `<p class="more"><button type="button" id="print-more">Show all ${printShown.length} maps</button></p>` : '')
    : '<p class="meta">Nothing matches. Clear the search or the filters.</p>';
  const more = $('print-more'); if (more) more.onclick = () => { printAll = true; renderPrint(); };
}
function openPrint(code) {
  lbIndex = printShown.findIndex(m => m.code === code);
  const m = printShown[lbIndex] || PM.find(x => x.code === code);
  $('lb-series').textContent = `${m.series} · ${m.area}`;
  $('lb-title').textContent = m.title;
  $('lb-meta').textContent = [m.code, m.stamp, m.original ? `first published ${fmtDate(m.original)}, remade ${fmtDate(m.date)}` : `last worked on ${fmtDate(m.date)}`].filter(Boolean).join(' · ');
  $('lb-img').hidden = m.image === false; if (m.image !== false) { $('lb-img').src = `static/${m.code}.jpg`; $('lb-img').alt = m.title; }
  $('lb-pdf').href = `pdfs/${m.code}.pdf`;
  $('lb-prev').disabled = lbIndex <= 0; $('lb-next').disabled = lbIndex < 0 || lbIndex >= printShown.length - 1;
  if (!$('lightbox').open) $('lightbox').showModal();
}
$('lb-close').onclick = () => $('lightbox').close();
$('lb-prev').onclick = () => printShown[lbIndex - 1] && openPrint(printShown[lbIndex - 1].code);
$('lb-next').onclick = () => printShown[lbIndex + 1] && openPrint(printShown[lbIndex + 1].code);
$('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });
$('lightbox').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') $('lb-prev').click(); if (e.key === 'ArrowRight') $('lb-next').click(); });

function renderTreemap() {
  const group = (items, key, leaf) => [...items.reduce((g, x) => g.set(x[key], [...(g.get(x[key]) || []), x]), new Map())].map(([name, xs]) => ({name, children: xs.map(leaf)}));
  const interactive = [...group(P.maps, 'ws', m => ({name: m.title, value: 1, map: m.id})),
    ...P.pending.map(p => ({name: `${p.ws} (${p.count} maps, links pending)`, value: p.count || 1}))];
  const paint = (nodes, color) => nodes.map(n => ({...n, itemStyle: {color}, ...(n.children ? {children: paint(n.children, color)} : {})}));
  const data = [{name: 'Interactive maps and dashboards', color: WB.brand, children: paint(interactive, WB.brand)},
    {name: 'Print and report maps', color: WB.brandDark, children: paint(group(PM, 'series', m => ({name: m.title, value: 1, print: m.code})), WB.brandDark)}]
    .map(d => ({...d, itemStyle: {color: d.color}}));
  const el = $('treemap'), thin = narrow(el); el.style.height = thin ? '640px' : '520px';
  const c = chart(el, {
    tooltip: {appendToBody: true, formatter: p => `<b>${esc(p.name)}</b>${p.data.children ? `<br>${p.value} deliverable${p.value > 1 ? 's' : ''}` : p.data.map || p.data.print ? '<br>Click to open' : ''}`},
    series: [{type: 'treemap', data, roam: false, nodeClick: false, breadcrumb: {show: false}, top: 0, left: 0, right: 0, bottom: 0, squareRatio: 1.2,
      levels: [{itemStyle: {borderWidth: 0, gapWidth: 8}},   // levels count from ECharts' hidden root
        {itemStyle: {borderColor: WB.page, borderWidth: 0, gapWidth: 4}, upperLabel: {show: true, height: 26, color: WB.text, fontWeight: 700, fontSize: 13, backgroundColor: '#fff'}},
        {itemStyle: {borderColor: '#fff', borderWidth: 2, gapWidth: 1}, upperLabel: {show: !thin, height: 18, color: WB.text, fontWeight: 600, fontSize: 12, overflow: 'truncate'}},
        {itemStyle: {borderColor: 'rgba(255,255,255,.35)', borderWidth: 1}, label: {show: false}}],
      emphasis: {itemStyle: {borderColor: WB.text}, upperLabel: {show: true}}}]
  }, `Treemap of ${P.maps.length + P.pending.reduce((n, p) => n + (p.count || 1), 0) + PM.length} deliverables: interactive maps and dashboards by project, print maps by series.`);
  c.off('click'); c.off('finished'); c.off('mouseover'); c.off('mouseout');
  c.on('click', p => { if (p.data.map) select(p.data.map, {scroll: true}); else if (p.data.print) openPrint(p.data.print); });
  // Each block shows its map: thumbnails laid over the chart at the blocks' positions (ECharts lays children out relative to their parent).
  const thumbs = $('treemap-thumbs'), tree = () => c.getModel().getSeriesByIndex(0).getData().tree;
  const src = d => d.map ? P.maps.find(m => m.id === d.map).thumb : d.print && PM.find(m => m.code === d.print).image !== false ? `static/t/${d.print}.jpg` : '';
  thumbs.innerHTML = '';
  c.on('finished', () => {
    const walk = (n, x, y) => { const l = n.getLayout(); if (!l) return; x += l.x; y += l.y;
      if (n.children.length) return n.children.forEach(k => walk(k, x, y));
      const d = tree().data.getRawDataItem(n.dataIndex), url = src(d); if (!url) return;
      let img = thumbs.querySelector(`[data-i="${n.dataIndex}"]`);
      if (!img) { img = new Image(); img.alt = ''; img.loading = 'lazy'; img.src = url; img.dataset.i = n.dataIndex; if (d.map) img.className = 'web'; thumbs.append(img); }
      Object.assign(img.style, {left: x + 1 + 'px', top: y + 1 + 'px', width: Math.max(0, l.width - 2) + 'px', height: Math.max(0, l.height - 2) + 'px'});
    };
    walk(tree().root, 0, 0);
  });
  c.on('mouseover', p => thumbs.querySelector(`[data-i="${p.dataIndex}"]`)?.classList.add('on'));
  c.on('mouseout', p => thumbs.querySelector(`[data-i="${p.dataIndex}"]`)?.classList.remove('on'));
  $('treemap-legend').innerHTML = data.map(d => `<span><i style="background:${d.color}"></i>${esc(d.name)}: ${d.children.reduce((n, c) => n + (c.value || c.children.length), 0)}</span>`).join('')
    + '<span>Each tile is one deliverable, grouped by project or series. Hover for the title; click to open it.</span>';
}

renderHeader(); renderPriorities(); renderGallery(); setupPrint(); renderPrint(); renderTreemap(); renderTimeline(); renderInitiatives(); renderFooter();
onBreakpoint(() => { renderPrint(); renderTreemap(); });
select(location.hash.slice(1));
