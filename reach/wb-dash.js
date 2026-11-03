// wb-dash.js — the dashboard below the map: KPI tiles, rankings, class distributions, time series and country table.
// DO NOT EDIT PER PROJECT. Each tab lists its elements in map.json ("dashboard"); app.js hands over the rows
// it already joined and classified, so every chart uses the map's own values, classes and colors.
// Rules (AGENTS.md section 6): marks wear the legend's class colors; text wears text colors; one axis;
// Taiwan, China and values inherited from another economy are left out of charts and statistics.
// The same drawing makes the on-screen chart and its PNG/SVG export.

import {COLORS, FONT, DISCLAIMER, esc, RANKED, CHART_TYPES} from './wb-carto.js';
import {embeddedFonts, embeddedLogo, wrap} from './wb-flat.js';
import {drawExplorer, explorerRows} from './wb-explorer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID = '#e3e8ec', BASELINE = '#c9d2d8', MEDIAN = '#767676';

// Titles shown on the card and in its export (map.json "title" overrides).
// What one mark stands for: an economy, or an area (admin unit) on admin maps. Set from ctx.noun on each render.
let N = {one: 'economy', many: 'economies'};
const cap = s => s[0].toUpperCase() + s.slice(1);
export function dashTitle(item) {
  if (item.title) return item.title;
  return {kpi: 'At a glance', bar: `${item.order === 'lowest' ? 'Lowest' : 'Highest'} ${item.top}`, histogram: `${cap(N.many)} by class`,
    dot: `${item.order === 'lowest' ? 'Lowest' : 'Highest'} ${item.top} · dots`,
    lollipop: `${item.order === 'lowest' ? 'Lowest' : 'Highest'} ${item.top} · lollipops`,
    pie: `${cap(N.many)} by class · pie chart`, donut: `${cap(N.many)} by class · donut chart`,
    line: 'Over time · line chart', area: 'Over time · area chart', explorer: `Explore ${N.many}`, table: `All ${N.many}`}[item.type];
}

let measureCtx;
function measure(text, fs, weight = 400, italic = false) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${italic ? 'italic ' : ''}${weight} ${fs}px ${FONT}`;
  return measureCtx.measureText(text).width;
}
function fit(text, fs, width, italic, weight = 400) {
  if (measure(text, fs, weight, italic) <= width) return text;
  let s = text;
  while (s.length > 1 && measure(s + '…', fs, weight, italic) > width) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
// A horizontal bar from the baseline x0 to the data end x1: 4 px rounded at the data end, square at the baseline.
function hbar(x0, x1, y, h, r = 4) {
  const d = x1 >= x0 ? 1 : -1;
  r = Math.min(r, Math.abs(x1 - x0), h / 2);
  return `M${x0},${y}H${x1 - d * r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - d * r},${y + h}H${x0}Z`;
}
const own = rows => rows.filter(r => r.value != null && Number.isFinite(r.value) && !r.inherited);
const median = values => {
  const v = [...values].sort((a, b) => a - b), n = v.length;
  return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null;
};

// ---------------------------------------------------------------------------
// Drawings. Each draws into an SVG group at a given width and returns its height.
// ctx: {rows, classes, fmt, map, year, series, selected, filter}; T: {fs} (font size in px).

// Rows of name, bar and value: the bar chart and the class histogram share this layout.
function barRows(g, W, T, items, {onHover, onClick} = {}, markType = 'bar') {
  const fs = T.fs, rowH = T.export ? Math.round(fs * 2) : Math.max(44, Math.round(fs * 2)), barH = Math.round(fs * 1.15);
  const nameW = Math.min(W * 0.42, Math.max(...items.map(d => measure(d.label, fs, 400, d.italic))) + 8);
  const valueW = Math.max(...items.map(d => measure(d.text, fs, 600))) + 10;
  const values = items.map(d => d.value);
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const x = d3.scaleLinear([lo, hi === lo ? hi + 1 : hi], [nameW, W - valueW]);
  const height = items.length * rowH;
  g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', height).attr('stroke', BASELINE).attr('stroke-width', 1);
  items.forEach((d, i) => {
    const row = g.append('g').attr('class', 'dash-row').attr('transform', `translate(0,${i * rowH})`).attr('opacity', markType === 'bar' && d.dim ? 0.3 : 1);
    if (d.iso) row.attr('data-iso', d.iso);
    if (d.cls != null) row.attr('data-cls', d.cls);
    row.append('rect').attr('class', 'hit').attr('width', W).attr('height', rowH).attr('fill', 'transparent');
    row.append('text').attr('x', nameW - 8).attr('y', rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', fs)
      .attr('font-style', d.italic ? 'italic' : null).attr('font-weight', d.strong ? 700 : 400).attr('fill', COLORS.text).text(fit(d.label, fs, nameW - 8, d.italic, d.strong ? 700 : 400));
    // The lightest classes nearly vanish on white: they get the faint edge the legend swatches have.
    if (markType === 'bar') row.append('path').attr('class', 'mark').attr('d', hbar(x(0), x(d.value), (rowH - barH) / 2, barH)).attr('fill', d.color)
      .attr('stroke', d3.lab(d.color).l > 88 ? '#00000026' : 'none').attr('stroke-width', 1);
    else {
      if (markType === 'lollipop') row.append('line').attr('x1', x(0)).attr('x2', x(d.value)).attr('y1', rowH / 2).attr('y2', rowH / 2)
        .attr('stroke', d.color).attr('stroke-width', 2).attr('opacity', d.dim ? 0.3 : 1);
      row.append('circle').attr('class', 'mark').attr('cx', x(d.value)).attr('cy', rowH / 2).attr('r', Math.max(4, fs * 0.36)).attr('fill', d.color)
        .attr('stroke', d3.lab(d.color).l > 88 ? '#00000040' : 'none').attr('stroke-width', 1).attr('opacity', d.dim ? 0.3 : 1);
    }
    const end = d.value < 0 ? x(0) + 6 : x(d.value) + 6;
    row.append('text').attr('x', end).attr('y', rowH / 2).attr('dy', '0.35em').attr('font-size', fs).attr('font-weight', 600)
      .attr('fill', COLORS.text).text(d.text);
    row.append('title').text(d.title || `${d.label}: ${d.text}`);
    if (onHover) row.on('pointerenter', () => onHover(d)).on('pointerleave', () => onHover(null));
    if (onClick) interactiveRow(row, d.title || `${d.label}: ${d.text}`, () => onClick(d));
  });
  return height;
}

function interactiveRow(row, label, action) {
  row.attr('role', 'button').attr('tabindex', 0).attr('aria-label', label).style('cursor', 'pointer').on('click', action)
    .on('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); } })
    .on('focus', () => row.select('.hit').attr('stroke', '#0071bc').attr('stroke-width', 2))
    .on('blur', () => row.select('.hit').attr('stroke', null));
}

function drawBar(g, W, ctx, item, T, on) {
  const rows = own(ctx.rows).sort((a, b) => item.order === 'lowest' ? a.value - b.value : b.value - a.value).slice(0, item.top);
  if (!rows.length) return empty(g, W, T);
  return barRows(g, W, T, rows.map(r => ({iso: r.iso, label: r.name, italic: r.italic, value: r.value, text: ctx.fmt(r.value), color: r.color,
    title: `${r.name}: ${ctx.fmt(r.value)}${r.year ? ` (${r.year})` : ''}`, strong: r.iso === ctx.selected,
    dim: (ctx.filter != null && r.cls !== ctx.filter) || (ctx.selected && rows.some(x => x.iso === ctx.selected) && r.iso !== ctx.selected)})),
  on && {onHover: d => on.hover(d?.iso ?? null), onClick: d => on.select(d.iso)}, item.type);
}

function drawHistogram(g, W, ctx, item, T, on) {
  const counts = new Map(ctx.classes.map(c => [c.cls, 0]));
  for (const r of ctx.rows) if (!r.inherited) counts.set(r.cls, (counts.get(r.cls) || 0) + 1);
  return barRows(g, W, T, ctx.classes.map(c => ({cls: c.cls, label: c.label, value: counts.get(c.cls), text: String(counts.get(c.cls)),
    color: c.color, dim: ctx.filter != null && c.cls !== ctx.filter, title: `${c.label}: ${counts.get(c.cls)} ${N.many}`})),
  on && {onClick: d => on.filter(d.cls)});
}

// Distribution slices count economies, not indicator values. Missing observations form their own class.
function classCounts(ctx) {
  const rows = ctx.rows.filter(r => !r.inherited);
  return {total: rows.length, classes: ctx.classes.map(c => ({...c, count: rows.filter(r => r.cls === c.cls).length}))};
}
const shareText = (count, total) => `${count} ${count === 1 ? N.one : N.many} · ${(total ? count / total * 100 : 0).toFixed(1)}%`;
function drawShares(g, W, ctx, item, T, on) {
  const {total, classes} = classCounts(ctx), fs = T.fs;
  if (!total) return empty(g, W, T);
  const side = W >= 540, diameter = Math.min(side ? W * 0.38 : W * 0.72, 260), radius = diameter / 2;
  const cx = side ? radius : W / 2, cy = radius + 4, donut = item.type === 'donut';
  const pie = d3.pie().sort(null).value(d => d.count)(classes);
  const arc = d3.arc().innerRadius(donut ? radius * 0.58 : 0).outerRadius(radius);
  const slices = g.append('g').attr('transform', `translate(${cx},${cy})`);
  for (const d of pie) {
    if (!d.data.count) continue;
    const path = slices.append('path').attr('class', 'mark').attr('data-cls', d.data.cls).attr('d', arc(d)).attr('data-count', d.data.count).attr('data-share', d.data.count / total * 100).attr('fill', d.data.color)
      .attr('stroke', '#fff').attr('stroke-width', 1).attr('opacity', ctx.filter != null && d.data.cls !== ctx.filter ? 0.3 : 1);
    path.append('title').text(`${d.data.label}: ${shareText(d.data.count, total)}`);
    if (on) path.style('cursor', 'pointer').on('click', () => on.filter(d.data.cls));
  }
  if (donut) {
    slices.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em').attr('font-size', fs * 1.8).attr('font-weight', 700).attr('fill', COLORS.text).text(total);
    slices.append('text').attr('text-anchor', 'middle').attr('dy', '1.6em').attr('font-size', fs).attr('fill', COLORS.textSubtle).text('Economies');
  }
  const lx = side ? diameter + 24 : 0, ly = side ? 0 : diameter + 20, legendW = W - lx;
  const rowH = T.export ? fs * 3.4 : Math.max(48, fs * 3.4);
  classes.forEach((c, i) => {
    const row = g.append('g').attr('class', 'dash-row').attr('data-cls', c.cls).attr('transform', `translate(${lx},${ly + i * rowH})`);
    row.append('rect').attr('class', 'hit').attr('width', legendW).attr('height', rowH).attr('fill', 'transparent');
    row.append('rect').attr('x', 1).attr('y', fs * 0.6).attr('width', fs).attr('height', fs).attr('fill', c.color).attr('stroke', '#00000026')
      .attr('opacity', ctx.filter != null && c.cls !== ctx.filter ? 0.3 : 1);
    row.append('text').attr('x', fs + 10).attr('y', fs * 1.35).attr('font-size', fs).attr('fill', COLORS.text).text(fit(c.label, fs, legendW - fs - 12));
    row.append('text').attr('class', 'dash-class-count').attr('data-count', c.count).attr('x', fs + 10).attr('y', fs * 2.9).attr('font-size', fs).attr('fill', COLORS.textSubtle).text(`${c.count} ${c.count === 1 ? N.one : N.many}`);
    row.append('text').attr('class', 'dash-class-share').attr('data-share', c.count / total * 100).attr('x', legendW - 2).attr('y', fs * 2.9).attr('text-anchor', 'end').attr('font-size', fs).attr('fill', COLORS.textSubtle).text(`${(c.count / total * 100).toFixed(1)}%`);
    row.append('title').text(`${c.label}: ${shareText(c.count, total)}`);
    if (on) interactiveRow(row, `Filter ${c.label}: ${shareText(c.count, total)}`, () => on.filter(c.cls));
  });
  return Math.ceil(Math.max(diameter + 8, ly + classes.length * rowH));
}

function textLines(text, fs, width, italic) {
  const lines = [], words = text.split(/\s+/); let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (current && measure(trial, fs, 400, italic) > width) { lines.push(current); current = word; }
    else current = trial;
  }
  if (current) lines.push(current);
  return lines.map(line => fit(line, fs, width, italic));
}

function drawLine(g, W, ctx, item, T) {
  const fs = T.fs, s = ctx.series, area = item.type === 'area';
  if (!s?.years?.length) return empty(g, W, T, 'No time-series data for this map.');
  const sel = ctx.selected && ctx.rows.find(r => r.iso === ctx.selected && !r.inherited);
  const lines = [{key: 'median', label: `Median of ${s.count} ${N.many}`, short: 'Median', color: MEDIAN, points: s.median || []}];
  if (sel) lines.push({key: sel.iso, label: sel.name, short: sel.name, italic: sel.italic, color: ctx.map.colors.at(-1), points: s.of(sel.iso)});
  const valid = p => p.value != null && Number.isFinite(p.value);
  const values = lines.flatMap(l => l.points.filter(valid).map(p => p.value));
  if (!values.length) return empty(g, W, T, 'No observed values in this time series.');
  // Each identity has its own wrapping row, so a long economy name stays inside a phone chart.
  let legendH = 0;
  for (const l of lines) {
    const labels = textLines(l.label, fs, W - 24, l.italic);
    g.append('line').attr('x1', 0).attr('x2', 16).attr('y1', legendH + fs * 0.7).attr('y2', legendH + fs * 0.7).attr('stroke', l.color).attr('stroke-width', 2).attr('stroke-linecap', 'round');
    labels.forEach((label, i) => g.append('text').attr('x', 22).attr('y', legendH + fs * (0.7 + i * 1.5)).attr('dy', '0.35em').attr('font-size', fs)
      .attr('font-style', l.italic ? 'italic' : null).attr('fill', COLORS.text).text(label));
    legendH += Math.round(fs * (labels.length * 1.5 + 0.3));
  }
  const hint = !sel && !T.export;
  if (hint) {
    const labels = textLines(`Select an ${N.one} on the map to compare it.`, fs, W);
    labels.forEach((label, i) => g.append('text').attr('x', 0).attr('y', legendH + fs * (1 + i * 1.5)).attr('font-size', fs).attr('fill', COLORS.textSubtle).text(label));
    legendH += fs * (labels.length * 1.5 + 0.5);
  }
  const top = legendH + 8, height = Math.round(top + Math.min(260, Math.max(160, W * 0.4)) + fs * 2);
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const y = d3.scaleLinear(lo === hi ? [0, 1] : [lo, hi], [height - fs * 2, top]).nice(4);
  const ticks = y.ticks(4), tickW = Math.min(W * 0.35, Math.max(...ticks.map(t => measure(ctx.fmt(t), fs))) + 8);
  const endW = W < 480 ? Math.max(8, measure(String(s.years.at(-1)), fs) / 2 + 2) : Math.min(W * 0.25, Math.max(...lines.map(l => measure(l.short, fs, 600, l.italic))) + 12);
  const years = d3.extent(s.years), domain = years[0] === years[1] ? [years[0] - 0.5, years[1] + 0.5] : years;
  const x = d3.scaleLinear(domain, [tickW, W - endW]);
  for (const t of ticks) {
    g.append('line').attr('x1', tickW).attr('x2', W - endW).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 0 ? BASELINE : GRID).attr('stroke-width', 1);
    g.append('text').attr('x', tickW - 8).attr('y', y(t)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', fs).attr('fill', COLORS.textSubtle).text(fit(ctx.fmt(t), fs, tickW - 8));
  }
  const xt = years[0] === years[1] ? [years[0]] : x.ticks(Math.max(2, Math.min(8, Math.floor((W - tickW - endW) / (fs * 4))))).filter(Number.isInteger);
  for (const t of xt) g.append('text').attr('x', x(t)).attr('y', height - fs * 0.6).attr('text-anchor', 'middle').attr('font-size', fs).attr('fill', COLORS.textSubtle).text(t);
  if (Number.isFinite(ctx.year)) g.append('line').attr('class', 'year-mark').attr('x1', x(ctx.year)).attr('x2', x(ctx.year)).attr('y1', top).attr('y2', height - fs * 2)
    .attr('stroke', BASELINE).attr('stroke-width', 1);
  const path = d3.line().defined(valid).x(p => x(p.year)).y(p => y(p.value));
  const fill = d3.area().defined(valid).x(p => x(p.year)).y0(y(0)).y1(p => y(p.value));
  const ends = [];
  for (const l of lines) {
    if (area) g.append('path').attr('class', 'mark').attr('data-series', l.key).attr('d', fill(l.points)).attr('fill', l.color).attr('fill-opacity', l.key === 'median' ? 0.16 : 0.22);
    g.append('path').attr('class', 'mark').attr('data-series', l.key).attr('d', path(l.points)).attr('fill', 'none').attr('stroke', l.color)
      .attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    const last = l.points.filter(valid).at(-1);
    l.points.forEach((p, i) => {
      if (p !== last && valid(p) && !valid(l.points[i - 1] || {}) && !valid(l.points[i + 1] || {}))
        g.append('circle').attr('class', 'mark').attr('data-series', l.key).attr('cx', x(p.year)).attr('cy', y(p.value)).attr('r', 4)
          .attr('fill', l.color).attr('stroke', '#fff').attr('stroke-width', 2);
    });
    if (last) ends.push({l, x: x(last.year), y: y(last.value)});
  }
  const clash = ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < fs * 1.2;
  for (const e of ends) {
    g.append('circle').attr('cx', e.x).attr('cy', e.y).attr('r', 4).attr('fill', e.l.color).attr('stroke', '#fff').attr('stroke-width', 2);
    if (!clash && W >= 480) g.append('text').attr('x', e.x + 8).attr('y', e.y).attr('dy', '0.35em').attr('font-size', fs).attr('font-weight', 600)
      .attr('font-style', e.l.italic ? 'italic' : null).attr('fill', COLORS.text).text(fit(e.l.short, fs, endW - 8, e.l.italic, 600));
  }
  g.node().__scales = {x, y, lines, top, bottom: height - fs * 2, left: tickW, right: W - endW};
  return height;
}

function empty(g, W, T, message = 'No data for this map.') {
  g.append('text').attr('y', T.fs * 1.2).attr('font-size', T.fs).attr('fill', COLORS.textSubtle).text(fit(message, T.fs, W));
  return T.fs * 2;
}
const DRAW = {bar: drawBar, dot: drawBar, lollipop: drawBar, histogram: drawHistogram, pie: drawShares, donut: drawShares, line: drawLine, area: drawLine, explorer: drawExplorer};

// A short text version of each chart for screen readers (the table holds every value).
function describe(item, ctx) {
  if (item.type === 'explorer') return `${dashTitle(item)}. ${item.layout || 'beeswarm'} layout. One point per ${N.one} with observed values. Select a point to select its ${N.one} on the main map. Beeswarm vertical displacement only separates dots; scatter compares ${ctx.map.legendTitle} with ${item.xColumn || 'a second numeric column'}.`;
  if (RANKED.includes(item.type)) {
    const rows = own(ctx.rows).sort((a, b) => item.order === 'lowest' ? a.value - b.value : b.value - a.value).slice(0, item.top);
    return `${dashTitle(item)}, ${ctx.map.legendTitle}: ` + rows.map(r => `${r.name} ${ctx.fmt(r.value)}`).join(', ');
  }
  if (item.type === 'histogram') return `${dashTitle(item)}: ` + ctx.classes.map(c => `${c.label}: ${ctx.rows.filter(r => !r.inherited && r.cls === c.cls).length}`).join(', ');
  if (['pie', 'donut'].includes(item.type)) {
    const {total, classes} = classCounts(ctx);
    return `${dashTitle(item)}. Share of ${total} ${N.many} by legend class, including no data; counts, not summed indicator values. ` +
      classes.map(c => `${c.label}: ${shareText(c.count, total)}`).join(', ');
  }
  if (!ctx.series?.years?.length) return `${dashTitle(item)}: no time-series data.`;
  const summary = (label, points) => {
    const observed = points.filter(p => p.value != null && Number.isFinite(p.value));
    return observed.length ? `${label}, ${observed[0].year} ${ctx.fmt(observed[0].value)} to ${observed.at(-1).year} ${ctx.fmt(observed.at(-1).value)}` : `${label}: no observed values`;
  };
  const sel = ctx.selected && ctx.rows.find(r => r.iso === ctx.selected && !r.inherited);
  return `${dashTitle(item)}: ${summary(`median of ${ctx.series.count} ${N.many}`, ctx.series.median || [])}. ` +
    (sel ? `${summary(sel.name, ctx.series.of(sel.iso))}. ` : '') +
    `Missing years are gaps.${item.type === 'area' ? ' Unstacked areas extend from zero.' : ''}`;
}

// ---------------------------------------------------------------------------
// The dashboard on screen. on: {hover(iso|null), select(iso), filter(cls), year(y), export(index, kind)}.
export function createDashboard(container, on) {
  let ctx = null, key = '', tableState = {sort: 'value', dir: -1, query: '', all: false};
  const cards = [], explorerLayouts = new Map();
  const fontSize = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-s')) || 14;

  function build() {
    container.innerHTML = '';
    cards.length = 0;
    tableState = {sort: 'value', dir: -1, query: '', all: false};
    ctx.items.forEach((item, i) => {
      const card = document.createElement('section');
      card.className = `dash-card dash-${item.type}`;
      card.setAttribute('aria-labelledby', `dash-h-${i}`);
      const exports = DRAW[item.type]
        ? `<div class="dash-actions"><button type="button" data-export="png" aria-label="Download ${esc(dashTitle(item))} as PNG">PNG</button><button type="button" data-export="svg" aria-label="Download ${esc(dashTitle(item))} as SVG">SVG</button></div>`
        : item.type === 'table' ? '<div class="dash-actions"><button type="button" data-export="csv">Download CSV</button></div>' : '';
      card.innerHTML = `<div class="dash-head"><div><h2 id="dash-h-${i}">${esc(dashTitle(item))}</h2><p class="dash-sub"></p></div>${exports}</div><div class="dash-body"></div>`;
      for (const b of card.querySelectorAll('[data-export]')) b.onclick = () => on.export(i, b.dataset.export);
      container.append(card);
      cards.push({item, index:i, card, body: card.querySelector('.dash-body'), sub: card.querySelector('.dash-sub')});
    });
  }

  function render(next) {
    ctx = next;
    N = next.noun || N;
    container.hidden = !ctx.items.length;
    if (!ctx.items.length) return;
    const k = ctx.map.id + JSON.stringify(ctx.items);
    if (k !== key) { key = k; build(); }
    for (const c of cards) draw(c);
  }

  function draw(c) {
    const {body} = c, m = ctx.map;
    const item = c.item.type === 'explorer' ? {...c.item,layout:explorerLayouts.get(`${m.id}:${c.index}`) || c.item.layout || 'beeswarm'} : c.item;
    const trend = ['line', 'area'].includes(item.type), share = ['pie', 'donut'].includes(item.type);
    c.sub.textContent = [share ? 'Economy counts by legend class · includes no data' : m.legendTitle,
      trend && ctx.series?.years?.length ? `${ctx.series.years[0]}–${ctx.series.years.at(-1)}` : ctx.yearLabel,
      item.type === 'area' ? 'Unstacked · zero baseline' : null].filter(Boolean).join(' · ');
    if (item.type === 'kpi') return kpis(body);
    if (item.type === 'table') return table(body, item);
    const W = Math.max(240, Math.floor(body.clientWidth || 320)), T = {fs: fontSize()};
    const active = body.contains(document.activeElement) ? document.activeElement : null;
    const focusSelector = active?.getAttribute('role') === 'slider' ? '[role=slider]' : active?.dataset.iso ? `.dash-row[data-iso="${CSS.escape(active.dataset.iso)}"]`
      : active?.dataset.cls ? `.dash-row[data-cls="${CSS.escape(active.dataset.cls)}"]` : null;
    body.innerHTML = '';
    if (item.type === 'explorer') {
      const controls=document.createElement('div'); controls.className='dash-explorer-controls';
      controls.setAttribute('role','group'); controls.setAttribute('aria-label','Data explorer layout');
      for (const layout of ['beeswarm','map','scatter']) {
        if (layout === 'scatter' && !item.xColumn) continue;
        const button=document.createElement('button');button.type='button';button.textContent={beeswarm:'Beeswarm',map:'Map',scatter:'Scatter'}[layout];
        button.dataset.explorerLayout=layout;button.setAttribute('aria-pressed',String(item.layout===layout));
        button.onclick=()=>{explorerLayouts.set(`${m.id}:${c.index}`,layout);draw(c);body.querySelector(`[data-explorer-layout="${layout}"]`)?.focus({preventScroll:true});};
        controls.append(button);
      }
      body.append(controls);
    }
    const svg = d3.select(body).append('svg').attr('class', 'dash-svg').attr('role', CHART_TYPES.includes(item.type) ? 'group' : 'img').attr('aria-label', describe(item, ctx))
      .attr('font-family', FONT).attr('width', W);
    if (share) svg.attr('data-total', classCounts(ctx).total);
    const g = svg.append('g');
    const height = DRAW[item.type](g, W, ctx, item, T, on);
    svg.attr('height', height).attr('viewBox', `0 0 ${W} ${height}`);
    if (item.type === 'explorer') {
      const detail=document.createElement('p'); detail.className='dash-note'; detail.setAttribute('aria-live','polite');
      const info=g.node().__explorer, selected=ctx.rows.find(r=>r.iso===ctx.selected);
      detail.textContent=`${info?.count || 0} ${N.many} shown; ${info?.excluded || 0} missing required observations.${item.layout==='beeswarm'?' Vertical placement separates overlapping dots; it does not encode a second measure.':''}${selected?` Selected: ${selected.name}, ${ctx.fmt(selected.value)}.`:''}`;
      body.append(detail);
    }
    if (trend && g.node().__scales) crosshair(body, svg, g.node().__scales, T);
    if (focusSelector) body.querySelector(focusSelector)?.focus({preventScroll: true});
  }

  // Line chart hover: a crosshair at the nearest year with every series' value; a click moves the map to that year.
  function crosshair(body, svg, sc, T) {
    const tip = document.createElement('div');
    tip.className = 'dash-tip'; tip.hidden = true; body.append(tip);
    const rule = svg.append('line').attr('y1', sc.top).attr('y2', sc.bottom).attr('stroke', COLORS.textSubtle).attr('stroke-width', 1).attr('visibility', 'hidden');
    const dots = sc.lines.map(l => svg.append('circle').attr('r', 4).attr('fill', l.color).attr('stroke', '#fff').attr('stroke-width', 2).attr('visibility', 'hidden'));
    const yearAt = px => ctx.series.years.reduce((best, y) => Math.abs(sc.x(y) - px) < Math.abs(sc.x(best) - px) ? y : best);
    svg.append('rect').attr('x', sc.left).attr('y', sc.top).attr('width', sc.right - sc.left).attr('height', sc.bottom - sc.top)
      .attr('fill', 'transparent').attr('role', 'slider').attr('tabindex', 0).attr('aria-label', 'Map year; use arrow keys to change year')
      .attr('aria-valuemin', ctx.series.years[0]).attr('aria-valuemax', ctx.series.years.at(-1)).attr('aria-valuenow', ctx.year)
      .style('cursor', 'pointer')
      .on('focus', function () { d3.select(this).attr('stroke', '#0071bc').attr('stroke-width', 2); })
      .on('blur', function () { d3.select(this).attr('stroke', null); })
      .on('keydown', e => {
        const years = ctx.series.years, at = Math.max(0, years.indexOf(ctx.year));
        const shift = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 0;
        const next = e.key === 'Home' ? years[0] : e.key === 'End' ? years.at(-1) : years[Math.max(0, Math.min(years.length - 1, at + shift))];
        if (shift || e.key === 'Home' || e.key === 'End') { e.preventDefault(); on.year(next); }
      })
      .on('pointermove', e => {
        const [px] = d3.pointer(e), y = yearAt(px), X = sc.x(y);
        rule.attr('x1', X).attr('x2', X).attr('visibility', 'visible');
        tip.innerHTML = `<b>${y}</b>` + sc.lines.map((l, i) => {
          const v = l.points.find(p => p.year === y)?.value;
          dots[i].attr('cx', X).attr('cy', v == null ? -99 : sc.y(v)).attr('visibility', v == null ? 'hidden' : 'visible');
          return `<span><i style="background:${l.color}"></i>${l.italic ? `<em>${esc(l.short)}</em>` : esc(l.short)} ${esc(ctx.fmt(v))}</span>`;
        }).join('');
        tip.hidden = false;
        const box = body.getBoundingClientRect(), scale = box.width / +svg.attr('width');
        tip.style.left = Math.min(X * scale + 12, box.width - tip.offsetWidth - 4) + 'px';
        tip.style.top = sc.top * scale + 'px';
      })
      .on('pointerleave', () => { tip.hidden = true; rule.attr('visibility', 'hidden'); dots.forEach(d => d.attr('visibility', 'hidden')); })
      .on('click', e => on.year(yearAt(d3.pointer(e)[0])));
  }

  function kpis(body) {
    const rows = own(ctx.rows), values = rows.map(r => r.value);
    const hi = rows.reduce((a, b) => (a && a.value >= b.value ? a : b), null), lo = rows.reduce((a, b) => (a && a.value <= b.value ? a : b), null);
    const tied = r => r ? rows.filter(x => x.value === r.value).length - 1 : 0;
    const nameOf = r => r ? (r.italic ? `<em>${esc(r.name)}</em>` : esc(r.name)) + (tied(r) ? ` and ${tied(r)} more` : '') : '';
    const tiles = [
      ['Economies with data', `${rows.length}`, `of ${ctx.rows.length}`],
      ['Median', ctx.fmt(median(values)), ''],
      ['Highest', ctx.fmt(hi?.value), nameOf(hi)],
      ['Lowest', ctx.fmt(lo?.value), nameOf(lo)]
    ];
    body.innerHTML = `<dl class="kpis">${tiles.map(([label, value, note]) =>
      `<div class="kpi"><dt>${label}</dt><dd><strong>${esc(value)}</strong>${note ? `<span>${note}</span>` : ''}</dd></div>`).join('')}</dl>`;
  }

  function table(body, item) {
    const st = tableState;
    if (!body.querySelector('table')) {
      body.innerHTML = `<label class="dash-filter"><span>Filter ${N.many}</span><input type="search" autocomplete="off" spellcheck="false"></label>
        <div class="dash-scroll"><table><thead><tr>
          <th scope="col" data-sort="name"><button type="button">Economy</button></th>
          <th scope="col" data-sort="value" class="num"><button type="button"></button></th>
          <th scope="col" class="num">Year</th></tr></thead><tbody></tbody></table></div>
        <p class="dash-note"></p><button type="button" class="dash-more"></button>`;
      const input = body.querySelector('input');
      input.value = st.query;
      input.oninput = () => { st.query = input.value; table(body, item); };
      for (const th of body.querySelectorAll('th[data-sort]')) th.querySelector('button').onclick = () => {
        st.dir = st.sort === th.dataset.sort ? -st.dir : th.dataset.sort === 'name' ? 1 : -1; st.sort = th.dataset.sort; table(body, item);
      };
      body.querySelector('.dash-more').onclick = () => { st.all = !st.all; table(body, item); };
      body.querySelector('tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-iso]'); if (tr) on.select(tr.dataset.iso); });
      body.querySelector('tbody').addEventListener('pointerover', e => on.hover(e.target.closest('tr[data-iso]')?.dataset.iso ?? null));
      body.querySelector('tbody').addEventListener('pointerleave', () => on.hover(null));
    }
    body.querySelector('th[data-sort="value"] button').textContent = ctx.map.legendTitle;
    for (const th of body.querySelectorAll('th[data-sort]'))
      th.setAttribute('aria-sort', st.sort === th.dataset.sort ? (st.dir > 0 ? 'ascending' : 'descending') : 'none');
    const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), q = fold(st.query.trim());
    let rows = ctx.rows.filter(r => !q || fold(r.name).includes(q) || r.iso.toLowerCase() === q);
    rows = rows.sort((a, b) => st.sort === 'name' ? st.dir * a.name.localeCompare(b.name)
      : (a.value == null) - (b.value == null) || st.dir * (a.value - b.value) || a.name.localeCompare(b.name));
    const shown = st.all || q ? rows : rows.slice(0, item.rows);
    body.querySelector('tbody').innerHTML = shown.map(r => `<tr data-iso="${esc(r.iso)}"${r.iso === ctx.selected ? ' aria-current="true"' : ''}${ctx.filter != null && r.cls !== ctx.filter ? ' class="dim"' : ''}>
      <th scope="row"><button type="button">${r.italic ? `<em>${esc(r.name)}</em>` : esc(r.name)}</button></th>
      <td class="num"><i class="swatch" style="background:${r.color}"></i>${esc(ctx.fmt(r.value))}${r.inherited ? `<small> ${esc(r.inheritedName)}'s value</small>` : ''}</td>
      <td class="num">${r.value != null && r.year ? esc(r.year) : ''}</td></tr>`).join('')
      || `<tr><td colspan="3" class="dash-none">No ${N.one} matches.</td></tr>`;
    const more = body.querySelector('.dash-more');
    more.hidden = !!q || rows.length <= item.rows;
    more.textContent = st.all ? `Show the first ${item.rows}` : `Show all ${rows.length}`;
    body.querySelector('.dash-note').textContent = 'Taiwan, China is shown with China\'s value on the map; select it on the map for its own value.';
  }

  // Map → dashboard: the selected economy and the legend filter.
  function update(patch) { if (ctx) { Object.assign(ctx, patch); for (const c of cards) draw(c); } }
  let width = 0, resizeFrame;   // redraw the charts when the width changes (their own height changes don't count)
  new ResizeObserver(([e]) => {
    if (Math.round(e.contentRect.width) === width) return;
    width = Math.round(e.contentRect.width);
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{if (ctx?.items.length) for (const c of cards) if (DRAW[c.item.type]) draw(c);});
  }).observe(container);

  return {
    render, item: i => cards[i]?.item.type === 'explorer' ? {...cards[i].item,layout:explorerLayouts.get(`${ctx.map.id}:${i}`) || cards[i].item.layout || 'beeswarm'} : cards[i]?.item, highlight: iso => update({selected: iso}), setFilter: cls => update({filter: cls}),
    // Read-only summary for tools/check.py: each element and the colors its marks wear.
    info: () => cards.map(({item, card}) => ({type: item.type, title: dashTitle(item),
      marks: [...card.querySelectorAll('.mark')].map(el => ({iso: el.closest('[data-iso]')?.dataset.iso, cls: el.closest('[data-cls]')?.dataset.cls,
        color: el.getAttribute('fill') !== 'none' ? el.getAttribute('fill') : el.getAttribute('stroke'),
        ...(el.hasAttribute('data-count') ? {count: +el.dataset.count, share: +el.dataset.share} : {})})),
      ...(['pie', 'donut'].includes(item.type) ? {total: +card.querySelector('svg').dataset.total} : {}),
      rows: card.querySelectorAll('tbody tr[data-iso]').length, tiles: card.querySelectorAll('.kpi').length}))
  };
}

// ---------------------------------------------------------------------------
// Export of one chart: title, subtitle, the chart, then source, stamp, italic disclaimer and the GCS logo,
// as in the map exports. Returns {svg, width, height, layout} for figurePNG().
export async function chartFigure(item, ctx, {title, subtitle, source, stamp}) {
  const width = 900, M = 32, fs = 14, lineH = fs * 1.5, logoW = 108, logoH = logoW * 21.96 / 39.64;
  const [fonts, logo] = await Promise.all([embeddedFonts(), embeddedLogo(), document.fonts.load(`italic ${fs}px 'Open Sans'`)]);
  const svg = d3.select(document.createElementNS(SVG_NS, 'svg')).attr('xmlns', SVG_NS).attr('font-family', FONT);
  svg.append('defs').append('style').text(fonts);
  const bg = svg.append('rect').attr('fill', '#ffffff');
  svg.append('text').attr('x', M).attr('y', 26 * 1.25 + 8).attr('font-size', 26).attr('font-weight', 700).attr('fill', COLORS.text).text(title);
  svg.append('text').attr('x', M).attr('y', 26 * 1.25 + 8 + 16 * 1.6).attr('font-size', 16).attr('fill', COLORS.textSubtle).text(subtitle);
  const top = 26 * 1.25 + 8 + 16 * 1.6 + 24;
  const g = svg.append('g').attr('transform', `translate(${M},${top})`);
  const chartH = DRAW[item.type](g, width - 2 * M, {...ctx, selected: ctx.selected, filter: null}, item, {fs, export: true});
  const ctx2d = document.createElement('canvas').getContext('2d');
  ctx2d.font = `italic ${fs}px ${FONT}`;
  const disclaimer = wrap(ctx2d, DISCLAIMER, width - 2 * M - logoW - 24);
  const footTop = top + chartH + 32;
  let y = footTop + fs;
  svg.append('text').attr('x', M).attr('y', y).attr('font-size', fs).attr('fill', COLORS.textSubtle).text(source);
  y += lineH;
  svg.append('text').attr('class', 'stamp').attr('x', M).attr('y', y).attr('font-size', fs).attr('font-weight', 600).attr('fill', COLORS.textSubtle).text(stamp);
  y += lineH;
  for (const line of disclaimer) { svg.append('text').attr('x', M).attr('y', y).attr('font-size', fs).attr('font-style', 'italic').attr('fill', COLORS.textSubtle).text(line); y += lineH; }
  svg.append('image').attr('class', 'logo').attr('href', logo).attr('x', width - M - logoW).attr('y', footTop).attr('width', logoW).attr('height', logoH);
  const height = Math.ceil(Math.max(y, footTop + logoH) + 16);
  svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  bg.attr('width', width).attr('height', height);
  return {svg: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg.node()), width, height, layout: 'screen'};
}
