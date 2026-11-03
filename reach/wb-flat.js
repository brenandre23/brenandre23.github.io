// wb-flat.js — the flat view: the map's coverage (the world in Equal Earth by default), drawn with d3 as SVG.
// DO NOT EDIT PER PROJECT. The same drawing makes the on-screen map and the
// SVG/PNG exports, so what you see is what you publish.
// Layer order, bottom to top: fills → hover/selected outline → WB borders → names.

import {COLORS, FONT, DISCLAIMER, LOGO, BOUNDARY_CATEGORIES, BORDER_WIDTH, RANK_BANDS,
  boundaryTiles, loadBoundaries, loadWorldBoundaries, loadCountryNames, coverageProjection, PROJECTION_NAMES, ADMIN_LINES} from './wb-carto.js';

import {drawFlatTemplate} from './wb-map-templates.js';
import {drawContextLines, drawTowns, appendSymbol, appendWbs, isPoints} from './wb-context.js';
import {drawTerrain} from './wb-terrain.js';

const W = 1000;          // drawing units; the SVG scales to fit its container
const MAX_ZOOM = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';
const dashArray = c => c.dash ? c.dash.map(n => n * BORDER_WIDTH).join(' ') : null;
const bordersPath = (path, features, c) => path({type: 'MultiLineString',
  coordinates: features.filter(f => f.properties._symbol === c.symbol).map(f => f.geometry.coordinates)});

const WORLD = {kind: 'world', label: 'World', projection: 'equalEarth'};
// The projection fitted to the map's coverage at a given width; the height follows the extent, up to maxHeight.
// World: Equal Earth fitted to the WB polygons, as always. Otherwise the coverage's projection fitted to its extent,
// with its padding, between 0.45 and 0.75 times as tall as wide (neighbors fill the rest of the frame).
function fitMap(coverage, features, width, pad, maxHeight = Infinity) {
  const world = coverage.kind === 'world', inner = world ? pad : pad + coverage.padding * width;
  const extent = world ? {type: 'FeatureCollection', features} : coverage.extent;
  const projection = coverageProjection(coverage).fitWidth(width - 2 * inner, extent);
  const [[, y0], [, y1]] = d3.geoPath(projection).bounds(extent);
  let height = Math.ceil(y1 - y0 + 2 * inner);
  if (!world) height = Math.ceil(Math.min(0.75 * width, Math.max(0.45 * width, height)));
  height = Math.min(height, maxHeight);
  projection.fitExtent([[inner, inner], [width - inner, height - inner]], extent);
  return {projection, height};
}
// The lon/lat box seen in a part of the drawing (sampled on a grid, so any projection works), with a margin.
function lonLatBox(projection, [x0, y0], [x1, y1], margin = 0.25) {
  const pts = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const p = projection.invert([x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * j / 8]);
    if (p && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) pts.push(p);
  }
  if (!pts.length) return null;
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const px = (e - w) * margin, py = (n - s) * margin;
  return [[Math.max(-180, w - px), Math.max(-85, s - py)], [Math.min(180, e + px), Math.min(85, n + py)]];
}
// Boundary tile level for a scale: about one tile pixel per screen pixel where the view is centred (z3 to z9).
function tileLevel(projection, centre, pxPerUnit) {
  const a = centre && projection([centre[0] - 0.5, centre[1]]), b = centre && projection([centre[0] + 0.5, centre[1]]);
  if (!a || !b || !(pxPerUnit > 0)) return 3;
  return Math.max(3, Math.min(9, Math.round(Math.log2(Math.hypot(b[0] - a[0], b[1] - a[1]) * pxPerUnit * 360 / 256))));
}
// WB boundary lines for a lon/lat box at a level, fewer tiles (a coarser level) when the box is large.
// Admin 1 (and 2) lines for a box on an admin map, each from its first zoom level in the tiles; a layer that would need
// more than maxTiles tiles is left out at this scale.
async function adminLinesFor(box, level, adminLevel, maxTiles = 48) {
  const out = {};
  for (const a of ADMIN_LINES.filter(a => a.level <= adminLevel)) {
    const tiles = boundaryTiles(Math.max(level, a.minzoom), box);
    if (tiles.length <= maxTiles) out[a.layer] = await loadBoundaries(tiles, a.layer);
  }
  return out;
}
const adminPaths = (group, path, lines, adminLevel, scale = 1) => group.selectAll('path').data(ADMIN_LINES.filter(a => a.level <= adminLevel)).join('path')
  .attr('d', a => path({type: 'MultiLineString', coordinates: (lines[a.layer] || []).map(f => f.geometry.coordinates)}))
  .attr('data-level', a => a.level).attr('fill', 'none').attr('stroke', COLORS.border).attr('stroke-width', a => a.width * scale)
  .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
function boundariesFor(box, level, maxTiles = 48) {
  if (!box) return loadWorldBoundaries().then(f => [f, 3]);
  let tiles = boundaryTiles(level, box);
  while (tiles.length > maxTiles && level > 3) tiles = boundaryTiles(--level, box);
  return level <= 3 ? loadWorldBoundaries().then(f => [f, 3]) : loadBoundaries(tiles).then(f => [f, level]);
}

// ---------------------------------------------------------------------------
// Interactive flat map. Callbacks get {kind: 'country'|'ndlsa', feature, lngLat, point}
// (point in container pixels). onClick gets null for a click on the sea.
export function createFlatMap(container, {countries, ndlsa, coverage = WORLD, adminLevel = 0, adminLines = 0, adminNames = null, context = {}, terrain = null, onHover, onClick, onLeave, onError, onObservation}) {
  const lineLevel = Math.max(adminLevel, adminLines);   // admin lines drawn: an admin map's own level, or adminLines
  const {projection, height: H} = fitMap(coverage, [...countries, ...ndlsa], W, 8);
  const path = d3.geoPath(projection);
  const svg = d3.select(container).append('svg').attr('class', 'flat-map').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', `${coverage.label} map, ${PROJECTION_NAMES[coverage.projection]} projection`);
  if (coverage.kind !== 'world') svg.style('overflow', 'visible');   // neighbors fill the frame around the coverage
  const root = svg.append('g');
  const fills = root.append('g');
  const countryPaths = fills.selectAll('path.country').data(countries).join('path').attr('class', 'country').attr('d', path);
  const ndlsaPaths = fills.selectAll('path.ndlsa').data(ndlsa).join('path').attr('class', 'ndlsa').attr('d', path);
  // Terrain (relief image and contours) over the fills, under the context lines and everything else.
  const terrainGroup = terrain ? root.append('g').attr('class', 'terrain').attr('pointer-events', 'none') : null;
  if (terrainGroup) drawTerrain(terrainGroup, projection, path, W, H, terrain.grid, {...terrain, clip: coverage.kind === 'countries' ? coverage.extent : null});
  const contextLines = Object.keys(context).some(k => k !== 'towns') ? root.append('g').attr('class', 'context').attr('pointer-events', 'none') : null;
  if (contextLines) drawContextLines(contextLines, path, context, 1, true, coverage.kind === 'countries' ? coverage.extent : null);
  const thematic = root.append('g');
  const adminBorders = lineLevel ? root.append('g').attr('class', 'admin-borders').attr('pointer-events', 'none') : null;
  const outline = root.append('g').attr('class', 'outline').attr('pointer-events', 'none');
  const borders = root.append('g').attr('class', 'borders').attr('pointer-events', 'none');
  const towns = svg.append('g').attr('class', 'towns').attr('pointer-events', 'none');   // symbols at screen size, like the names
  const names = svg.append('g').attr('class', 'names').attr('pointer-events', 'none');
  // Labels appear by zoom relative to the whole world, so a country map starts "zoomed in" as far as names go.
  const degree = p => { const c = p.invert([W / 2, H / 2]) || [0, 0], a = p([c[0] - 0.5, c[1]]), b = p([c[0] + 0.5, c[1]]); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 1; };
  const zoomBase = coverage.kind === 'world' ? 1 : degree(projection) / degree(fitMap(WORLD, [...countries, ...ndlsa], W, 8).projection);
  let transform = d3.zoomIdentity, bordersDrawn = {level: 0, counts: {}};

  // Pointer → what's under it, where on the globe, where in the container.
  const hit = e => {
    const el = e.target.closest?.('path.country, path.ndlsa');
    if (!el) return null;
    const box = container.getBoundingClientRect();
    return {kind: el.classList.contains('ndlsa') ? 'ndlsa' : 'country', feature: el.__data__,
      lngLat: projection.invert(d3.pointer(e, root.node())), point: [e.clientX - box.left, e.clientY - box.top]};
  };
  const observation=(row,e,pin)=>{const box=container.getBoundingClientRect(),b=e?.currentTarget?.getBoundingClientRect?.();onObservation?.(row,{point:e?.clientX?[e.clientX-box.left,e.clientY-box.top]:b?[b.x+b.width/2-box.left,b.y+b.height/2-box.top]:null,target:e?.currentTarget},pin);};
  svg.on('pointermove', e => {const point=e.target.closest?.('.spatial-hit,.spatial-point,.spatial-line');if(point){observation(point.__data__,e,false);return;} const h = hit(e); h ? onHover(h) : onLeave(); });
  svg.on('pointerleave', () => onLeave());
  svg.on('click', e => onClick(hit(e)));

  // Zoom and pan inside the world frame. Borders keep 0.65 px at every zoom.
  const zoom = d3.zoom().scaleExtent([1, MAX_ZOOM]).translateExtent([[0, 0], [W, H]])
    .on('zoom', e => { transform = e.transform; root.attr('transform', transform); placeNames(); })
    .on('end', () => { clearTimeout(detailTimer); detailTimer = setTimeout(updateDetail, 150); });
  svg.call(zoom);

  // ---- WB borders: z3 for the world, finer tiles for the visible area at larger scales (zoomed in, or a country).
  let worldLines = null, detailTimer, detailRequest = 0;
  function drawBorders(features, level) {
    borders.selectAll('path').data(BOUNDARY_CATEGORIES).join('path')
      .attr('d', c => bordersPath(path, features, c)).attr('data-symbol', c => c.name)
      .attr('fill', 'none').attr('stroke', COLORS.border).attr('stroke-width', BORDER_WIDTH)
      .attr('stroke-dasharray', dashArray).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke');
    bordersDrawn = {level, counts: Object.fromEntries(BOUNDARY_CATEGORIES.map(c => [c.name, features.filter(f => f.properties._symbol === c.symbol).length]))};
  }
  loadWorldBoundaries().then(f => { worldLines = f; if (bordersDrawn.level <= 3) drawBorders(f, 3); if (coverage.kind !== 'world' || lineLevel) updateDetail(); }).catch(onError);
  // Admin maps: the admin lines for the view, and the detailed unit shapes once zoomed in (2.5× or more).
  let adminDrawn = {}, detailShown = false;
  const hasDetail = countries.some(f => f.detailGeometry);
  async function updateDetail() {
    const request = ++detailRequest, box = svg.node().getBoundingClientRect();
    const level = tileLevel(projection, projection.invert(transform.invert([W / 2, H / 2])), transform.k * Math.min(box.width / W, box.height / H));
    const area = lonLatBox(projection, transform.invert([0, 0]), transform.invert([W, H]));   // margin so a short pan doesn't show gaps
    if (hasDetail && (transform.k >= 2.5) !== detailShown) {
      detailShown = transform.k >= 2.5;
      countryPaths.filter(f => f.detailGeometry).attr('d', f => path(detailShown ? {type: 'Feature', geometry: f.detailGeometry} : f));
    }
    if (lineLevel && area) adminLinesFor(area, level, lineLevel).then(lines => {
      if (request !== detailRequest) return;
      adminPaths(adminBorders, path, lines, lineLevel).attr('vector-effect', 'non-scaling-stroke');
      adminDrawn = Object.fromEntries(ADMIN_LINES.map(a => [a.level, (lines[a.layer] || []).length]));
    }).catch(onError);
    if (level === 3) { if (worldLines && bordersDrawn.level !== 3) drawBorders(worldLines, 3); return; }
    if (!area) return;
    try {
      const [features, drawn] = await boundariesFor(area, level);
      if (request === detailRequest) drawBorders(features, drawn);
    } catch (err) { onError(err); }
  }

  // ---- WB country names (label points), with simple collision avoidance. Admin maps add the WB admin unit names,
  // after the country names, and leave out the name of the country the units divide.
  let labelData = null, adminLabelData = null, namesOn = false;
  const inUnit = xy => countries.some(f => f.properties.unit && d3.geoContains(f, xy));
  function placeNames() {
    const box = svg.node().getBoundingClientRect();
    const unit = 1 / Math.max(1e-6, Math.min(box.width / W, box.height / H));   // drawing units per screen px
    const onScreen = c => { const xy = projection(c); if (!xy) return null; const [x, y] = transform.apply(xy); return x < 0 || x > W || y < 0 || y > H ? null : [x, y]; };
    const townNames = drawTowns(towns, onScreen, context, unit);   // point and town symbols always; their names with the others
    if (!namesOn || !labelData) { names.selectAll('text').remove(); return; }
    const k = transform.k * zoomBase, grow = (Math.min(k, 6) - 1) / 5 * 3.5;
    const placed = [], shown = [];
    for (const f of labelData) {
      const p = f.properties, band = RANK_BANDS.find(([lo, hi]) => p.scalerank >= lo && p.scalerank <= hi);
      if (!band || k < band[3]) continue;
      const xy = projection(f.geometry.coordinates);
      if (!xy) continue;
      const [x, y] = transform.apply(xy), size = (11.5 - 0.5 * p.scalerank + grow) * unit;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const text = k < 3 ? p.ADM0_ABBR : p.ADM0_NAME, w = text.length * size * 0.56, h = size * 1.2;
      const left = p.justify === 'L' ? x + 0.4 * size : p.justify === 'R' ? x - 0.4 * size - w : x - w / 2;
      const r = [left - 2 * unit, y - h / 2, left + w + 2 * unit, y + h / 2];
      if (placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      placed.push(r); shown.push({text, x: left, y, size, italic: p.territory === 'Y'});
    }
    for (const t of townNames) {   // World Bank town names, largest class first, right of their symbol
      const w = t.text.length * t.size * 0.55, h = t.size * 1.2, r = [t.x - unit, t.y - h / 2, t.x + w + unit, t.y + h / 2];
      if (r[2] > W || placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      placed.push(r); shown.push({text: t.text, x: t.x, y: t.y, size: t.size, weight: t.weight, town: true});
    }
    for (const a of adminLabelData || []) {
      const xy = projection(a.coordinates);
      if (!xy) continue;
      const [x, y] = transform.apply(xy), size = (12 + grow / 2) * unit, w = a.name.length * size * 0.52, h = size * 1.2;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const r = [x - w / 2 - unit, y - h / 2, x + w / 2 + unit, y + h / 2];
      if (placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      placed.push(r); shown.push({text: a.name, x: x - w / 2, y, size, admin: true});
    }
    names.selectAll('text').data(shown).join('text').text(d => d.text).attr('x', d => d.x).attr('y', d => d.y)
      .attr('dominant-baseline', 'central').attr('font-family', FONT).attr('font-size', d => d.size).attr('font-weight', d => d.weight || (d.admin ? 400 : 600))
      .attr('font-style', d => d.italic ? 'italic' : null).attr('fill', d => d.admin ? COLORS.textSubtle : COLORS.text).attr('class', d => d.admin ? 'admin-name' : d.town ? 'town-name' : null)
      .attr('stroke', 'rgba(255,255,255,0.85)').attr('stroke-width', 2.6 * unit).attr('paint-order', 'stroke')
      .attr('stroke-linejoin', 'round');
  }
  new ResizeObserver(() => placeNames()).observe(container);

  const toScreen = xy => {
    const p = new DOMPoint(...xy).matrixTransform(root.node().getScreenCTM()), box = container.getBoundingClientRect();
    return [p.x - box.left, p.y - box.top];
  };
  const moveTo = (t, animate) => (animate ? svg.transition().duration(700) : svg).call(zoom.transform, t);

  return {
    kind: 'flat',
    recolor(countryColor, ndlsaColor) { countryPaths.attr('fill', countryColor); ndlsaPaths.attr('fill', ndlsaColor); },
    setTemplate(data) { svg.attr('role',['choropleth','extrusion','heatmap'].includes(data.kind)?'img':'group');const box=svg.node().getBoundingClientRect();drawFlatTemplate(thematic, projection, data, W, observation, Math.min(box.width/W,box.height/H), H, coverage.kind === 'countries' ? coverage.extent : null); },
    setDim(isDim) { countryPaths.attr('opacity', f => isDim(f) ? 0.18 : null); },
    setOutline(features) {
      outline.selectAll('path').data(features).join('path').attr('d', path).attr('fill', 'none')
        .attr('stroke', COLORS.text).attr('stroke-width', 1.6).attr('vector-effect', 'non-scaling-stroke');
    },
    async setNames(on) {
      namesOn = on;
      if (on && !labelData) labelData = [...(await loadCountryNames()).features].sort((a, b) => a.properties.scalerank - b.properties.scalerank)
        .filter(f => !adminLevel || !inUnit(f.geometry.coordinates));
      if (on && adminNames && !adminLabelData) adminLabelData = await adminNames();
      placeNames();
    },
    home(animate = true) { moveTo(d3.zoomIdentity, animate); },
    zoomBy(factor) { svg.transition().duration(250).call(zoom.scaleBy, factor); },
    zoomTo(feature) {
      const [[x0, y0], [x1, y1]] = path.bounds(feature);
      const k = Math.max(1, Math.min(6, 0.7 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
      moveTo(d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2), true);
    },
    project(lngLat) { const xy = projection(lngLat); return xy ? toScreen(transform.apply(xy)) : null; },
    bordersInfo: () => ({...bordersDrawn, admin: adminDrawn, detail: detailShown}),
    contextInfo: () => ({...Object.fromEntries([...(contextLines?.node().querySelectorAll(':scope > g') || [])].map(g => [g.getAttribute('class').replace('context-', ''), g.querySelectorAll('path').length])),
      ...Object.fromEntries(Object.keys(context).filter(isPoints).map(n => [n, towns.selectAll(`.point-${n}`).size()])),
      towns: towns.node().childElementCount, townNames: names.selectAll('text.town-name').size(),
      relief: terrainGroup?.selectAll('image.relief').size() || 0, contours: terrainGroup?.selectAll('path.contours').filter(function () { return this.getAttribute('d'); }).size() || 0}),
    transform: () => ({k: transform.k, x: transform.x, y: transform.y, width: W, height: H}),
    namesShown: () => names.selectAll('text').nodes().map(n => n.textContent),
    show(on) { container.hidden = !on; if (on) placeNames(); }
  };
}

// ---------------------------------------------------------------------------
// Export figure: the map's coverage (the full world in Equal Earth by default) with title, legend, source and the
// disclaimer. Thematic layers only (no basemap or names). Returns SVG text.
// Type follows the WB data-viz guide for a large chart (s 14, m 16, l 20 px) in
// Open Sans, embedded so the SVG and the PNG look the same on any machine.
const FS = {s: 14, m: 16, l: 20};
const FONT_FILES = {
  'normal-latin': 'latin', 'normal-latin-ext': 'latinExt', 'italic-latin': 'latin', 'italic-latin-ext': 'latinExt'
};
const UNICODE_RANGES = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  latinExt: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'
};
let fontCSS;
export function embeddedFonts() {
  return fontCSS ||= Promise.all(Object.entries(FONT_FILES).map(async ([name, range]) => {
    const r = await fetch(`vendor/fonts/OpenSans-${name}.woff2`);
    if (!r.ok) throw new Error(`Font missing: vendor/fonts/OpenSans-${name}.woff2`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `@font-face{font-family:'Open Sans';font-style:${name.split('-')[0]};font-weight:400 700;` +
      `src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');unicode-range:${UNICODE_RANGES[range]}}`;
  })).then(rules => rules.join('')).catch(e => { fontCSS = null; throw e; });
}

// The GCS logo as a data URI, so the SVG and PNG carry it like the fonts.
let logoURI;
export const embeddedLogo = () => logoURI ||= fetch(LOGO).then(r => {
  if (!r.ok) throw new Error(`Logo missing: ${LOGO}`);
  return r.text();
}).then(text => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)).catch(e => { logoURI = null; throw e; });

// Figure layouts. Screen: 1600 px wide, WB data-viz type for a large chart. Print: a 6.5 in frame (the text
// width of a US Letter page), 100 units per inch, type in points (1 pt = 100/72 units). Landscape fills a 6.5 × 4.5 in
// frame; portrait is as tall as its content, up to 9 in (a world map is twice as wide as tall), with the legend below the map.
// Print titles are centred.
const PT = 100 / 72;   // standard symbols in a figure: their screen size (1 pt = 1 px) times the figure's type size over the screen's (L.s / FS.s)
export const LAYOUTS = {
  screen: {width: 1600, pad: 24, margin: 32, title: 26, sub: FS.m, s: FS.s, m: FS.m, line: 1.5, rowH: 26, swatch: 18,
    legendW: 320, legendPad: 18, logoW: 108, gap: 24, centre: false},
  landscape: {width: 650, height: 450, fill: true, pad: 4, margin: 6, title: 11 * PT, sub: 8 * PT, s: 6.5 * PT, m: 7.5 * PT, line: 1.4,
    rowH: 12, swatch: 8, legendW: 150, legendPad: 7, logoW: 64, gap: 10, centre: true},
  portrait: {width: 650, height: 900, pad: 4, margin: 6, title: 12 * PT, sub: 8.5 * PT, s: 7 * PT, m: 8 * PT, line: 1.4,
    rowH: 13, swatch: 9, legendW: 220, legendPad: 0, logoW: 72, gap: 14, centre: true, legendBelow: true}
};

export async function buildFigureSVG({countries, ndlsa, countryColor, ndlsaColor, title, subtitle = '', legendTitle, legend, source, stamp, thematic, coverage = WORLD, adminLevel = 0, adminLines: lineLevel = 0, context = {}, terrain = null}, layout = 'screen') {
  lineLevel = Math.max(adminLevel, lineLevel);
  const L = LAYOUTS[layout], width = L.width, logoH = L.logoW * 21.96 / 39.64, lineH = L.s * L.line;
  const [fonts, logo] = await Promise.all([embeddedFonts(), embeddedLogo(), document.fonts.load(`italic ${L.s}px 'Open Sans'`)]);
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `italic ${L.s}px ${FONT}`;
  const disclaimer = wrap(measure, DISCLAIMER, width - 2 * L.margin - L.logoW - L.gap);
  const mapTop = L.title * 1.7 + (subtitle ? L.sub * 1.6 : 0);
  const footH = lineH * (2 + disclaimer.length) + L.gap / 2;
  const legendH = 2 * L.legendPad + L.m * 1.9 + legend.length * L.rowH;
  // Screen: the map's height follows its width. Print: the page height is fixed, so the map fits the space left.
  const room = L.height ? L.height - mapTop - footH - L.gap - (L.legendBelow ? legendH + L.gap : 0) : Infinity;
  const {projection, height: mapHeight} = fitMap(coverage, [...countries, ...ndlsa], width, L.pad, room);
  // Borders: the world at z3; a region or country at the level its scale needs (export pixels at 2×).
  const box = lonLatBox(projection, [0, 0], [width, mapHeight], 0.05), level = tileLevel(projection, projection.invert([width / 2, mapHeight / 2]), 2);
  const boundaries = coverage.kind === 'world' ? await loadWorldBoundaries() : (await boundariesFor(box, level, 64))[0];
  const adminLines = lineLevel && box ? await adminLinesFor(box, level, lineLevel, 64) : null;
  const below = L.legendBelow ? legendH + L.gap : 0, content = Math.ceil(mapTop + mapHeight + L.gap + below + Math.max(footH, logoH + 4) + (L.height ? L.gap / 2 : 20));
  const height = L.fill ? L.height : content;
  const path = d3.geoPath(projection).digits(2);

  const svg = d3.select(document.createElementNS(SVG_NS, 'svg')).attr('xmlns', SVG_NS)
    .attr('width', L.height ? `${width / 100}in` : width).attr('height', L.height ? `${height / 100}in` : height)
    .attr('viewBox', `0 0 ${width} ${height}`).attr('font-family', FONT);
  svg.append('defs').append('style').text(fonts);
  svg.append('rect').attr('width', width).attr('height', height).attr('fill', COLORS.water);
  const tx = L.centre ? width / 2 : L.margin, anchor = L.centre ? 'middle' : 'start';
  svg.append('text').attr('x', tx).attr('y', L.title * 1.25).attr('text-anchor', anchor).attr('font-size', L.title).attr('font-weight', 700).attr('fill', COLORS.text).text(title);
  if (subtitle) svg.append('text').attr('x', tx).attr('y', L.title * 1.25 + L.sub * 1.5).attr('text-anchor', anchor).attr('font-size', L.sub).attr('fill', COLORS.textSubtle).text(subtitle);

  svg.select('defs').append('clipPath').attr('id', 'map-frame').append('rect').attr('width', width).attr('height', mapHeight);
  const map = svg.append('g').attr('transform', `translate(0,${mapTop})`).attr('clip-path', 'url(#map-frame)');
  map.append('g').selectAll('path').data(countries).join('path').attr('d', path).attr('fill', countryColor);
  map.append('g').selectAll('path').data(ndlsa).join('path').attr('d', path).attr('fill', ndlsaColor);
  if (terrain) drawTerrain(map.append('g').attr('class', 'terrain'), projection, path, width, mapHeight, terrain.grid, {...terrain, pixels: L.height ? 2 : 1, scale: L.height ? 0.6 : 1, screen: false, clip: coverage.kind === 'countries' ? coverage.extent : null});
  if (Object.keys(context).some(k => k !== 'towns')) drawContextLines(map.append('g').attr('class', 'context'), path, context, L.height ? 0.6 : 1, false, coverage.kind === 'countries' ? coverage.extent : null);
  if (thematic) drawFlatTemplate(map.append('g'), projection, thematic, width, null, 1, mapHeight, coverage.kind === 'countries' ? coverage.extent : null, L.height ? 2 : 1, L.s / FS.s);
  if (adminLines) adminPaths(map.append('g').attr('class', 'admin-borders'), path, adminLines, lineLevel, L.height ? 0.6 : 1);
  map.append('g').attr('fill', 'none').attr('stroke', COLORS.border).attr('stroke-width', BORDER_WIDTH * (L.height ? 0.6 : 1))
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
    .selectAll('path').data(BOUNDARY_CATEGORIES).join('path').attr('d', c => bordersPath(path, boundaries, c)).attr('stroke-dasharray', dashArray);
  if (context.towns || Object.keys(context).some(isPoints)) {   // point and town symbols and World Bank names on top, towns sized with the figure's type, names without collisions
    const unit = L.s / 14, inFrame = c => { const p = projection(c); return p && p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= mapHeight ? p : null; };
    const placed = [], names = drawTowns(map.append('g').attr('class', 'towns'), inFrame, context, unit, L.s / FS.s).filter(t => {
      const w = t.text.length * t.size * 0.55, r = [t.x, t.y - t.size * 0.6, t.x + w, t.y + t.size * 0.6];
      if (r[2] > width || placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) return false;
      placed.push(r); return true;
    });
    map.append('g').attr('class', 'town-names').selectAll('text').data(names).join('text').attr('x', t => t.x).attr('y', t => t.y).attr('dominant-baseline', 'central')
      .attr('font-size', t => t.size).attr('font-weight', t => t.weight).attr('fill', COLORS.text).attr('stroke', '#ffffff').attr('stroke-width', 2 * unit)
      .attr('paint-order', 'stroke').attr('stroke-linejoin', 'round').text(t => t.text);
  }
  if (coverage.kind !== 'world') drawFurniture(svg, projection, countries, coverage, L, width, mapTop, mapHeight);
  svg.append('rect').attr('x', .5).attr('y', mapTop + .5).attr('width', width - 1).attr('height', mapHeight - 1)
    .attr('fill', 'none').attr('stroke', '#b7c5ce').attr('stroke-width', L.height ? 0.5 : 1);

  // Legend: inside the map's lower-left corner, or below the map (portrait). Swatches and labels share one baseline.
  const lx = L.legendBelow ? L.margin : L.pad + (L.height ? L.gap : 0), ly = L.legendBelow ? mapTop + mapHeight + L.gap : mapTop + mapHeight - L.gap - legendH;
  const lg = svg.append('g').attr('class', 'legend');
  if (!L.legendBelow) lg.append('rect').attr('x', lx).attr('y', ly).attr('width', L.legendW).attr('height', legendH).attr('rx', L.legendPad / 2)
    .attr('fill', 'rgba(255,255,255,.96)').attr('stroke', '#d3dde4').attr('stroke-width', L.height ? 0.5 : 1);
  lg.append('text').attr('x', lx + L.legendPad).attr('y', ly + L.legendPad + L.m).attr('font-size', L.m).attr('font-weight', 600).attr('fill', COLORS.text).text(legendTitle);
  legend.forEach((item, i) => {
    const y = ly + L.legendPad + L.m * 1.9 + i * L.rowH;
    const sx = lx + L.legendPad, mid = y + L.swatch / 2;   // a class or area: a square; a line: a line; a point: a dot or square
    const line = (stroke, width) => lg.append('line').attr('x1', sx).attr('x2', sx + L.swatch).attr('y1', mid).attr('y2', mid).attr('stroke', stroke).attr('stroke-width', width);
    if (item.svg) appendWbs(lg, item.svg, sx + L.swatch / 2, mid, L.s / FS.s, null, L.rowH);   // a standard symbol, at most a row high
    else if (item.kind === 'line') {
      const w = Math.max(1.5, item.width * 2);
      if (item.casing) line(item.casing.stroke, w + Math.max(1, item.casing.width * 4));
      line(item.color, w).attr('stroke-dasharray', item.dash ? item.dash.join(' ') : null);
    } else if (item.kind === 'point') appendSymbol(lg, sx + L.swatch / 2, mid, item, item.symbol === 'star' ? L.swatch / 2 : L.swatch / 3, L.swatch / 14);
    else lg.append('rect').attr('x', sx).attr('y', y).attr('width', L.swatch).attr('height', L.swatch).attr('fill', item.color);
    lg.append('text').attr('x', lx + L.legendPad + L.swatch * 1.6).attr('y', y + L.swatch / 2).attr('dominant-baseline', 'central')
      .attr('font-size', L.s).attr('fill', COLORS.text).text(item.label);
  });

  // Footer: source, stamp and the italic disclaimer on the left, the GCS logo on the right (at the page foot in print).
  const footTop = L.fill ? height - footH : mapTop + mapHeight + L.gap + below;
  let y = footTop + L.s;
  svg.append('text').attr('x', L.margin).attr('y', y).attr('font-size', L.s).attr('fill', COLORS.textSubtle).text(source);
  y += lineH;
  svg.append('text').attr('class', 'stamp').attr('x', L.margin).attr('y', y).attr('font-size', L.s).attr('font-weight', 600).attr('fill', COLORS.textSubtle).text(stamp);
  y += lineH;
  svg.append('image').attr('class', 'logo').attr('href', logo).attr('x', width - L.margin - L.logoW).attr('y', footTop)
    .attr('width', L.logoW).attr('height', logoH);
  for (const line of disclaimer) { svg.append('text').attr('x', L.margin).attr('y', y).attr('font-size', L.s).attr('font-style', 'italic').attr('fill', COLORS.textSubtle).text(line); y += lineH; }
  return {svg: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg.node()), width, height, layout};
}

// Map furniture for a region, country or area figure (standard 2.0, phase G): a locator inset (the world, the covered
// countries dark; fills only, never outlines as borders), a north arrow and a scale bar at the map's centre.
const NICE = [1, 2, 5];
function drawFurniture(svg, projection, countries, coverage, L, width, mapTop, mapHeight) {
  const g = svg.append('g').attr('class', 'map-furniture').attr('font-family', FONT), unit = L.s / 14, gap = L.gap;
  // Locator inset, top right.
  const iw = Math.round(width * 0.2), ih = Math.round(iw * 0.52), ix = width - iw - gap, iy = mapTop + gap;
  const inset = g.append('g').attr('class', 'locator-inset').attr('transform', `translate(${ix},${iy})`);
  const ip = d3.geoEqualEarth().fitExtent([[2, 2], [iw - 2, ih - 2]], {type: 'Sphere'}), ipath = d3.geoPath(ip);
  inset.append('rect').attr('width', iw).attr('height', ih).attr('fill', '#ffffff').attr('stroke', '#b7c5ce').attr('stroke-width', unit * 0.8);
  inset.append('g').selectAll('path').data(countries).join('path').attr('d', ipath).attr('fill', f => coverage.inside(f) ? '#4d4d4d' : '#d9d9d9');
  const [[bx0, by0], [bx1, by1]] = ipath.bounds(coverage.extent);
  inset.append('rect').attr('x', bx0 - 2 * unit).attr('y', by0 - 2 * unit).attr('width', bx1 - bx0 + 4 * unit).attr('height', by1 - by0 + 4 * unit)
    .attr('fill', 'none').attr('stroke', '#111111').attr('stroke-width', unit);
  // North arrow, under the inset.
  const nx = width - gap - 8 * unit, ny = iy + ih + gap + 4 * unit, na = 12 * unit;
  const north = g.append('g').attr('class', 'north-arrow').attr('transform', `translate(${nx},${ny})`);
  north.append('path').attr('d', `M0,0 L${na * 0.4},${na} L0,${na * 0.75} L${-na * 0.4},${na} Z`).attr('fill', COLORS.text);
  north.append('text').attr('x', 0).attr('y', na + L.s * 1.1).attr('text-anchor', 'middle').attr('font-size', L.s).attr('font-weight', 700).attr('fill', COLORS.text).text('N');
  // Scale bar, bottom right: the longest round distance up to a fifth of the width, measured at the centre.
  const cx = width / 2, cy = mapHeight / 2, a = projection.invert([cx - 50, cy]), b = projection.invert([cx + 50, cy]);
  if (!a || !b) return;
  const kmPerUnit = d3.geoDistance(a, b) * 6371 / 100, most = width * 0.2 * kmPerUnit;
  const step = 10 ** Math.floor(Math.log10(most)), km = NICE.map(n => n * step).filter(v => v <= most).pop() || step;
  const bw = km / kmPerUnit, bh = 4 * unit, sx = width - gap - bw, sy = mapTop + mapHeight - gap - L.s * 1.6;
  const bar = g.append('g').attr('class', 'scale-bar').attr('transform', `translate(${sx},${sy})`);
  bar.append('rect').attr('width', bw / 2).attr('height', bh).attr('fill', COLORS.text);
  bar.append('rect').attr('x', bw / 2).attr('width', bw / 2).attr('height', bh).attr('fill', '#ffffff').attr('stroke', COLORS.text).attr('stroke-width', unit * 0.6);
  bar.append('rect').attr('width', bw).attr('height', bh).attr('fill', 'none').attr('stroke', COLORS.text).attr('stroke-width', unit * 0.6);
  for (const [x, text] of [[0, '0'], [bw, `${km.toLocaleString('en-US')} km`]])
    bar.append('text').attr('x', x).attr('y', bh + L.s * 1.2).attr('text-anchor', x ? 'end' : 'start').attr('font-size', L.s).attr('fill', COLORS.text).text(text);
}

// Print or save as PDF: the print figure alone on a page of its own size, through the browser's print dialog
// (vector, fonts embedded; no software to install). Choose "Save as PDF" as the printer for a PDF.
export function printFigure({svg, width, height}) {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, {position: 'fixed', width: '0', height: '0', border: '0', visibility: 'hidden'});
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title><style>` +
    `@page{size:${width / 100}in ${height / 100}in;margin:0}html,body{margin:0}svg{display:block;width:${width / 100}in;height:${height / 100}in}` +
    `</style></head><body>${svg.replace(/^<\?xml[^>]*>\s*/, '')}</body></html>`);
  doc.close();
  return new Promise(resolve => setTimeout(() => {
    frame.contentWindow.focus(); frame.contentWindow.print();
    setTimeout(() => { frame.remove(); resolve(); }, 1000);
  }, 300));
}

// PNG of an export figure. Screen figures at 2×; print figures at a resolution in dots per inch.
export async function figurePNG({svg, width, height, layout}, scale = layout && layout !== 'screen' ? 3 : 2) {
  const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not draw the map image')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale; canvas.height = height * scale;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image export unavailable');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export function wrap(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
