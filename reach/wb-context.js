// wb-context.js — context layers (standard 2.1). DO NOT EDIT PER PROJECT.
// Towns, roads, railways, rivers and lakes, and catalog lines and areas, from data/context/, built by the standard's
// tools/context_build.py from the recipes in gis/layers/ (CONTEXT-LAYERS.md). Each feature carries its geometry and a
// class only: never a boundary, and the only names on the map are World Bank town names. The attribution of every
// source joins the source line.

export const CONTEXT_LAYERS = ['lakes', 'rivers', 'roads', 'railways', 'towns'];   // drawn bottom to top
// Styles by class. Widths in px; town label sizes never under 12 px. Rivers, roads and town symbols follow the World
// Bank standard symbols (owner, October 2026; CMYK converted to screen color): rivers C80 M20, main roads a C0 M0 Y60 K0
// fill inside a thin C0 M25 Y35 K0 casing (its width each side), other roads thin grays, the national capital a star,
// cities and towns rings.
// Lakes and railways: approved by the standard owner, October 2026.
export const CONTEXT_STYLE = {
  lakes: {lake: {fill: '#cfe2f0'}, reservoir: {fill: '#cfe2f0'}},
  rivers: {major: {stroke: '#08a1dc', width: 1.0}, medium: {stroke: '#08a1dc', width: 0.6}, minor: {stroke: '#08a1dc', width: 0.35}},
  roads: {1: {stroke: '#fff689', width: 1.4, casing: {stroke: '#fcc9a6', width: 0.4}}, 2: {stroke: '#ababab', width: 0.7}, 3: {stroke: '#c3c3c3', width: 0.45}},
  railways: {rail: {stroke: '#6f6f6f', width: 0.6, dash: [3, 2]}},
  towns: {
    capital: {symbol: 'star', size: 5.5, fill: '#111111', labelSize: 13, weight: 700},
    'city-xl': {symbol: 'double-ring', size: 3.2, fill: '#ffffff', stroke: '#111111', labelSize: 12.5, weight: 600},
    'city-lg': {symbol: 'double-ring', size: 3.2, fill: '#ffffff', stroke: '#111111', labelSize: 12, weight: 600},
    'city-md': {symbol: 'ring', size: 3.2, fill: '#ffffff', stroke: '#111111', labelSize: 12, weight: 400},
    'city-sm': {symbol: 'ring', size: 3.2, fill: '#ffffff', stroke: '#111111', labelSize: 12, weight: 400}
  }
};
// The star of the standard symbols, radius 1, pointing up (scaled by the class size).
const STAR = 'M0.214 -0.322L0.943 -0.322L0.354 0.118L0.582 0.812L0 0.382L-0.585 0.812L-0.354 0.118L-0.943 -0.322L-0.219 -0.321L-0.001 -1Z';
// One town symbol at (x, y) into a d3 selection, as flat siblings (no group); r = size in drawing units, unit = drawing
// units per px.
export function appendSymbol(group, x, y, s, r, unit = 1, cls = null) {
  if (s.symbol === 'star') return void group.append('path').attr('class', cls).attr('d', STAR).attr('transform', `translate(${x} ${y}) scale(${r})`)
    .attr('fill', s.fill).attr('stroke', '#ffffff').attr('stroke-width', 0.8 * unit / r).attr('paint-order', 'stroke');
  for (const k of s.symbol === 'double-ring' ? [1, 0.4] : [1]) group.append('circle').attr('class', cls).attr('cx', x).attr('cy', y).attr('r', r * k)
    .attr('fill', k === 1 ? s.fill : 'none').attr('stroke', s.stroke || '#ffffff').attr('stroke-width', unit);
}
// World Bank standard symbols (assets/symbols/, made from the bank's file by the standard's tools/wbg_symbols.py), by
// file name, drawn as they are: 1 pt of the symbol = 1 px on screen; figures scale them with their type size.
const SYMBOLS = {};
let symbolCopies = 0;
export async function loadSymbols(names, readText) {
  for (const n of names) if (!SYMBOLS[n]) {
    const text = await readText(`assets/symbols/${n}.svg`), [x, y, w, h] = text.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    SYMBOLS[n] = {cx: x + w / 2, cy: y + h / 2, size: Math.max(w, h), body: text.replace(/^.*?<\/title>|<\/svg>\s*$/gs, '')};
  }
}
export const hasSymbol = n => !!SYMBOLS[n];
// Its markup with ids of its own (a page holds several copies of a gradient).
const symbolBody = n => { const k = ++symbolCopies; return SYMBOLS[n].body.replace(/id="([^"]+)"/g, `id="$1-${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${k})`); };
// One standard symbol centred on (x, y) into a d3 selection; scale = drawing units per pt, at most max units across.
export function appendWbs(group, n, x, y, scale, cls = null, max = Infinity) {
  const s = SYMBOLS[n], k = Math.min(scale, max / s.size);
  return group.append('g').attr('class', cls).attr('transform', `translate(${x - s.cx * k} ${y - s.cy * k}) scale(${k})`).html(symbolBody(n));
}
// The same symbol as inline SVG markup, for the on-screen legend (a standard symbol at its size, up to px).
export const symbolSVG = (s, px = 14) => {
  if (s.svg) { const {cx, cy, size} = SYMBOLS[s.svg], v = Math.max(size, px); return `<svg class="symbol" width="${px}" height="${px}" viewBox="${cx - v / 2} ${cy - v / 2} ${v} ${v}" aria-hidden="true">${symbolBody(s.svg)}</svg>`; }
  const r = s.symbol === 'star' ? px / 2 - 0.5 : px / 2 - 2.5, c = px / 2;
  const body = s.symbol === 'star' ? `<path d="${STAR}" transform="translate(${c} ${c}) scale(${r})" fill="${s.fill}"/>`
    : `<circle cx="${c}" cy="${c}" r="${r}" fill="${s.fill}" stroke="${s.stroke}"/>` + (s.symbol === 'double-ring' ? `<circle cx="${c}" cy="${c}" r="${r * 0.4}" fill="none" stroke="${s.stroke}"/>` : '');
  return `<svg class="symbol" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" aria-hidden="true">${body}</svg>`;
};
// Legend entries, in this order, for the layers a map shows.
const LEGEND = [
  {layer: 'towns', cls: 'capital', label: 'National capital', kind: 'point'},
  {layer: 'towns', cls: 'city-lg', also: ['city-xl'], label: 'Main city', kind: 'point'},
  {layer: 'towns', cls: 'city-sm', also: ['city-md'], label: 'Town', kind: 'point'},
  {layer: 'roads', cls: '1', label: 'Main road', kind: 'line'},
  {layer: 'roads', cls: '3', label: 'Other road', kind: 'line'},
  {layer: 'railways', cls: 'rail', label: 'Railway', kind: 'line'},
  {layer: 'rivers', cls: 'major', label: 'River', kind: 'line'},
  {layer: 'lakes', cls: 'lake', label: 'Lake or reservoir', kind: 'area'}
];
// Catalog lines, areas and points (wb-catalog-layer): their kind, style and legend labels come from
// data/context/manifest.json. Points are drawn with the standard symbols (style {class: {svg: file name}}).
const catalog = {};
export const styleOf = name => CONTEXT_STYLE[name] || catalog[name]?.style || {};
export const isArea = name => name === 'lakes' || catalog[name]?.kind === 'areas';
export const isPoints = name => catalog[name]?.kind === 'points';
// Drawing order, bottom to top: catalog areas, lakes, rivers, roads, railways, catalog lines, catalog points, towns.
export const contextOrder = layers => {
  const extra = kind => Object.keys(catalog).filter(n => catalog[n].kind === kind);
  return [...extra('areas'), ...CONTEXT_LAYERS.filter(n => n !== 'towns'), ...extra('lines'), ...extra('points'), 'towns'].filter(n => layers[n]);
};
export const contextLegend = layers => [...LEGEND.filter(e => layers[e.layer]?.some(f => [e.cls, ...(e.also || [])].includes(String(f.properties.class))))
  .map(e => ({...e, ...CONTEXT_STYLE[e.layer][e.cls]})),
  ...contextOrder(layers).filter(n => catalog[n]).flatMap(n => Object.entries(catalog[n].labels)
    .filter(([cls]) => layers[n].some(f => String(f.properties.class) === cls))
    .map(([cls, label]) => ({layer: n, cls, label, kind: {areas: 'area', lines: 'line', points: 'point'}[catalog[n].kind], ...catalog[n].style[cls]})))]
  .filter((e, i, all) => all.findIndex(o => o.layer === e.layer && o.label === e.label) === i);   // classes that share a label and symbol: one entry

// The layers map.json lists, with the source attribution line. readText(path) reads a file of the map (or the preview).
export async function loadContext(names, readText) {
  if (!names?.length) return {layers: {}, attribution: ''};
  const manifest = JSON.parse(await readText('data/context/manifest.json')), layers = {};
  for (const k of Object.keys(catalog)) delete catalog[k];   // a new map (the builder's preview loads several)
  for (const name of names.filter(n => n !== 'elevation')) {
    const entry = manifest.layers?.[name];
    if (!entry) throw new Error(`data/context/${name}.geojson is not in data/context/manifest.json: build it with tools/context_build.py`);
    if (!CONTEXT_LAYERS.includes(name)) {
      if (!['lines', 'areas', 'points'].includes(entry.kind) || !entry.style || !entry.labels) throw new Error(`data/context/manifest.json has no kind, style and labels for "${name}": rebuild it with tools/context_build.py`);
      catalog[name] = {kind: entry.kind, style: entry.style, labels: entry.labels};
      if (entry.kind === 'points') await loadSymbols(Object.values(entry.style).map(s => s.svg), readText);
    }
    layers[name] = JSON.parse(await readText(`data/context/${name}.geojson`)).features;
  }
  const credits = new Map();   // one credit per source, naming its layers: "© OpenStreetMap contributors (roads, railways)"
  for (const name of [...contextOrder(layers), 'elevation'].filter(n => layers[n] || n === 'elevation' && names.includes(n) && manifest.layers?.[n])) credits.set(manifest.layers[name].attribution, [...(credits.get(manifest.layers[name].attribution) || []), name]);
  return {layers, attribution: credits.size ? 'Context: ' + [...credits].map(([credit, list]) => `${credit} (${list.join(', ')})`).join(' · ') : ''};
}

// Lines and areas (everything but points and towns) into an SVG group; widths times scale (print), constant on screen. Catalog
// layers come from wider sources than the country, so they are clipped to clip (GeoJSON: the covered countries).
export function drawContextLines(group, path, layers, scale = 1, screen = true, clip = null) {
  group.selectAll('*').remove();
  const clipId = `context-clip-${screen ? 'screen' : 'export'}`;
  if (clip && Object.keys(layers).some(n => catalog[n])) group.append('clipPath').attr('id', clipId).append('path').attr('d', path(clip));
  for (const name of contextOrder(layers).filter(n => n !== 'towns' && !isPoints(n))) {
    const g = group.append('g').attr('class', `context-${name}`).attr('clip-path', clip && catalog[name] ? `url(#${clipId})` : null);
    const classes = [...d3.group(layers[name], f => String(f.properties.class))].filter(([cls]) => styleOf(name)[cls])
      .map(([cls, features]) => [cls, path({type: 'FeatureCollection', features})]);   // each class's path once, casing and fill share it
    // A cased line (roads): every class's casing first, then the fills, so crossings join cleanly.
    for (const casing of [true, false]) for (const [cls, d] of classes) {
      const s = styleOf(name)[cls], c = casing ? s.casing : s;
      if (!c || casing && s.fill) continue;
      const el = g.append('path').attr('data-class', cls).attr('class', casing ? 'casing' : null).attr('d', d);
      if (s.fill) { el.attr('fill', s.fill).attr('stroke', 'none'); continue; }
      el.attr('fill', 'none').attr('stroke', c.stroke).attr('stroke-width', (casing ? s.width + 2 * c.width : s.width) * scale).attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round').attr('stroke-dasharray', s.dash && !casing ? s.dash.map(v => v * scale).join(' ') : null);
      if (screen) el.attr('vector-effect', 'non-scaling-stroke');
    }
  }
}

// Catalog point symbols, then town symbols over them, and town label candidates at drawing positions xy([lon, lat]) ->
// [x, y] | null; unit = drawing units per px (towns), pt = drawing units per pt (standard symbols). Returns the labels to
// place (largest class first); the caller places them with the other names, avoiding collisions.
export function drawTowns(group, xy, layers, unit = 1, pt = unit) {
  const order = Object.keys(CONTEXT_STYLE.towns), shown = [];
  group.selectAll('*').remove();
  for (const name of contextOrder(layers).filter(isPoints)) for (const f of layers[name]) {
    const p = xy(f.geometry.coordinates), s = catalog[name].style[f.properties.class];
    if (p && s) appendWbs(group, s.svg, p[0], p[1], pt, `point-${name}`);
  }
  for (const f of [...(layers.towns || [])].sort((a, b) => order.indexOf(a.properties.class) - order.indexOf(b.properties.class))) {
    const p = xy(f.geometry.coordinates), s = CONTEXT_STYLE.towns[f.properties.class];
    if (p && s) shown.push({p, s, name: f.properties.name});
  }
  for (const {p: [x, y], s} of shown) appendSymbol(group, x, y, s, s.size * unit, unit, 'town');
  return shown.map(({p: [x, y], s, name}) => ({x: x + (s.size + 2) * unit, y, text: name, size: s.labelSize * unit, weight: s.weight}));
}
