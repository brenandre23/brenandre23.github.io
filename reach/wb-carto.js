// wb-carto.js — World Bank cartography rules and sources shared by every webmap.
// DO NOT EDIT PER PROJECT. Change a rule here (and in AGENTS.md/CARTOGRAPHY.md) or not at all.
// Both views draw from this file: the flat Equal Earth view (wb-flat.js) and the globe (wb-globe.js).
// Project-specific settings belong in app.js CONFIG.

import {VectorTile} from './vendor/vector-tile.js';
import Pbf from './vendor/pbf.js';

// Version of the standard this map was built from (CHANGELOG.md in the standard). tools/check.py reports it.
export const STANDARD_VERSION = '2.3.0';

export const DISCLAIMER = 'This map was produced by the Cartography Unit of the World Bank Group. The boundaries, colors, denominations and any other information shown on this map do not imply, on the part of the World Bank Group, any judgment on the legal status of any territory, or any endorsement or acceptance of such boundaries.';

export const COLORS = {
  water: '#ffffff',          // map background (flat view and export)
  border: '#ffffff',         // WB_GAD international boundaries
  noData: '#e6e6e6',         // missing / not assessed
  outside: '#f2f2f2',        // neighbors: economies outside the map's coverage (never in the legend)
  westernSahara: '#e6e6e6',  // same gray as noData; kept separate so the rule stays explicit
  text: '#111111',           // WB data-viz text (values, titles)
  textSubtle: '#666666'      // WB data-viz secondary text (units, notes, source)
};
// WB data-viz typeface, self-hosted in vendor/fonts (style.css @font-face).
export const FONT = "'Open Sans', sans-serif";

// WB data-viz number format: '.' for decimals, ',' for thousands; values of
// 10,000 or more scaled to K / M / B. Decimals: the map's own setting for
// unscaled values, otherwise 2 below 1, 1 below 100 and 0 above.
// prefix / suffix carry units such as '$' and '%'. Missing values → 'No data'.
export function formatNumber(v, {decimals = null, prefix = '', suffix = ''} = {}) {
  if (v == null || !Number.isFinite(v)) return 'No data';
  const abs = Math.abs(v);
  const [n, letter] = abs >= 1e9 ? [v / 1e9, 'B'] : abs >= 1e6 ? [v / 1e6, 'M'] : abs >= 1e4 ? [v / 1e3, 'K'] : [v, ''];
  const a = Math.abs(n);
  const d = !letter && decimals != null ? decimals : a === 0 ? 0 : a < 1 ? 2 : a < 100 ? 1 : 0;
  const text = Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
  return (v < 0 && text.replace(/[0.,]/g, '') ? '-' : '') + prefix + text + letter + suffix;
}

// ---------------------------------------------------------------------------
// Color ramps (AGENTS.md section 6): the one list used by map.json, app.js, tools/check.py and the builder.
// Never typed by hand: n classes always use the n-class ramp, light to dark.
// ColorBrewer and Viridis come from the vendored d3. The WBG ramps are the WB data-viz guide's own
// (https://wbg-vis-design.vercel.app/colors.json), each published for one class count.
const WBG = {
  'WBG Blue': ['#E3F6FD', '#75CCEC', '#089BD4', '#0169A1', '#023B6F'],
  'WBG Sequential': ['#FDF6DB', '#A1CBCF', '#5D99C2', '#2868A0', '#023B6F'],
  'WBG Yellow': ['#FDF7DB', '#ECB63A', '#BE792B', '#8D4117', '#5C0000'],
  'WBG Purple': ['#FFE2FF', '#D3ACE6', '#A37ACD', '#6F4CB4', '#2F1E9C'],
  'WBG Green': ['#D2FFE1', '#8AD4A7', '#54A67F', '#27795A', '#084D31'],
  'WBG Red': ['#FFD6B9', '#F99C78', '#E56245', '#C1261A', '#870000'],
  'WBG Diverging': ['#920000', '#BD6126', '#E3A763', '#EFEFEF', '#80BDE7', '#3587C3', '#025288']
};
export const PALETTES = {
  recommended: ['Blues', 'Greens', 'Oranges', 'OrRd', 'WBG Blue'],
  sequential: ['Blues', 'Greens', 'Greys', 'Oranges', 'Purples', 'Reds', 'BuGn', 'BuPu', 'GnBu', 'OrRd', 'PuBuGn', 'PuBu',
    'PuRd', 'RdPu', 'YlGnBu', 'YlGn', 'YlOrBr', 'YlOrRd'],
  diverging: ['BrBG', 'PRGn', 'PiYG', 'PuOr', 'RdBu', 'RdGy', 'RdYlBu', 'RdYlGn', 'Spectral'],
  continuous: ['Viridis', 'Cividis', 'Magma', 'Inferno', 'Plasma'],   // sampled evenly
  wbg: Object.keys(WBG)
};
export const DEFAULT_CLASSES = 5;
const CLASS_RANGE = {sequential: [3, 9], diverging: [3, 11], continuous: [2, 11]};
const KINDS = ['sequential', 'diverging', 'continuous', 'wbg'];
const kindOf = name => KINDS.find(k => PALETTES[k].includes(name));
const rangeOf = name => kindOf(name) === 'wbg' ? [WBG[name].length, WBG[name].length] : CLASS_RANGE[kindOf(name)];
const counts = ([lo, hi]) => lo === hi ? String(lo) : `${lo}–${hi}`;

// The colors of a named ramp for a number of classes. Throws a readable error for an unknown name or count.
export function paletteColors(name, classes = DEFAULT_CLASSES, d3 = globalThis.d3) {
  const kind = kindOf(name);
  if (!kind) throw new Error(`unknown palette "${name}". Use one of: ${KINDS.flatMap(k => PALETTES[k]).join(', ')}`);
  const [lo, hi] = rangeOf(name);
  if (!(classes >= lo && classes <= hi)) throw new Error(`${name} has ${counts([lo, hi])} classes, not ${classes}`);
  if (kind === 'wbg') return WBG[name].map(c => c.toLowerCase());
  // The Viridis family runs dark to light in d3; reversed so low values are light, like every other ramp.
  const colors = kind === 'continuous' ? d3.quantize(d3['interpolate' + name], classes).reverse() : d3['scheme' + name][classes];
  return colors.map(c => d3.color(c).formatHex());
}

// Which ramp a list of colors is: {name, classes} when it is exactly a published ramp, else null (custom colors).
export function paletteOf(colors, d3 = globalThis.d3) {
  const want = colors.map(c => c.toLowerCase()).join();
  for (const name of KINDS.flatMap(k => PALETTES[k])) {
    try { if (paletteColors(name, colors.length, d3).join() === want) return {name, classes: colors.length}; } catch { /* count out of range */ }
  }
  return null;
}

// Why a list of colors breaks the ramp rule, or null: a ramp reversed, or colors picked from ramps of other class counts.
export function paletteProblem(colors, d3 = globalThis.d3) {
  if (paletteOf(colors, d3)) return null;
  const n = colors.length, have = colors.map(c => c.toLowerCase()), reversed = paletteOf([...colors].reverse(), d3);
  const use = (name, k) => `palette: '${name}'${k === DEFAULT_CLASSES ? '' : `, classes: ${k}`} (or colors ${JSON.stringify(paletteColors(name, k, d3))})`;
  if (reversed) return `the colors run dark to light; use ${use(reversed.name, n)}`;
  for (const name of KINDS.flatMap(k => PALETTES[k])) {
    const [lo, hi] = rangeOf(name), all = new Set();
    for (let k = lo; k <= hi; k++) paletteColors(name, k, d3).forEach(c => all.add(c));
    if (!have.every(c => all.has(c))) continue;
    return n >= lo && n <= hi ? `${n} classes need the ${n}-class ${name} ramp, not colors picked from other ${name} ramps: ${use(name, n)}`
      : `${name} has ${counts([lo, hi])} classes, not ${n}`;
  }
  return null;   // custom colors: allowed when the user asked for them
}

// ---------------------------------------------------------------------------
// map.json: the only project file besides data/. One validator for the app, the builder and the checker.
// Fills in palette colors and defaults; returns a list of plain-English problems (empty = valid).
export const NO_DATA_LABEL = 'No data';
export const MAP_ID = /^IBRD \d{5}$/;   // IBRD + 5 digits; the number and date come from the user, never invented
// Spatial CSV bindings shared by the builder and runtime. These are thematic observations,
// never replacements for the approved World Bank country geometry, borders or names.
export const MAP_TEMPLATES = ['choropleth', 'proportional-symbol', 'locator', 'flow', 'route', 'heatmap', 'extrusion', 'reference', 'raster'];
export const SPATIAL_KINDS = ['points', 'flows', 'routes'];
const SPATIAL_COMMON = ['dataFile', 'kind', 'labelColumn', 'valueColumn', 'timeColumn', 'unit', 'valueLabel'];
const SPATIAL_BINDINGS = {
  points: ['latitudeColumn', 'longitudeColumn'],
  flows: ['sourceLatitudeColumn', 'sourceLongitudeColumn', 'targetLatitudeColumn', 'targetLongitudeColumn'],
  routes: ['latitudeColumn', 'longitudeColumn', 'groupColumn', 'orderColumn']
};
export function spatialDataProblems(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['spatialData must be an object'];
  const problems = [], bindings = SPATIAL_BINDINGS[spec.kind];
  if (!bindings) problems.push(`spatialData.kind must be one of ${SPATIAL_KINDS.join(', ')}`);
  const path = spec.dataFile;
  if (typeof path !== 'string' || !/^data\/[^?#:\\%\x00-\x1f]+\.csv$/i.test(path) || path.split('/').some(p => !p || p === '.' || p === '..'))
    problems.push('spatialData.dataFile must be a relative data/*.csv path without traversal, a URL or credentials');
  for (const key of bindings || []) if (typeof spec[key] !== 'string' || !spec[key].trim()) problems.push(`spatialData.${key} missing`);
  for (const key of ['labelColumn', 'valueColumn', 'timeColumn']) if (spec[key] !== undefined && (typeof spec[key] !== 'string' || !spec[key].trim())) problems.push(`spatialData.${key} must name a column`);
  for (const key of ['unit','valueLabel']) if (spec[key] !== undefined && (typeof spec[key] !== 'string' || spec[key].length>300)) problems.push(`spatialData.${key} must be text of at most 300 characters`);
  const extra = Object.keys(spec).filter(key => ![...SPATIAL_COMMON, ...(bindings || [])].includes(key));
  if (extra.length) problems.push(`spatialData: unknown setting ${extra.join(', ')}`);
  return problems;
}
function mapTemplateProblems(m, name) {
  const problems = [];
  m.mapTemplate ??= 'choropleth';
  if (!MAP_TEMPLATES.includes(m.mapTemplate)) problems.push(`${name}: mapTemplate must be one of ${MAP_TEMPLATES.join(', ')}`);
  const required = {locator: 'points', heatmap: 'points', flow: 'flows', route: 'routes'}[m.mapTemplate];
  if (required && !m.spatialData) problems.push(`${name}: ${m.mapTemplate} needs spatialData with kind "${required}"`);
  if (m.spatialData !== undefined) {
    spatialDataProblems(m.spatialData).forEach(p => problems.push(`${name}: ${p}`));
    if (required && m.spatialData?.kind !== required) problems.push(`${name}: ${m.mapTemplate} needs spatialData.kind "${required}"`);
    if (m.mapTemplate === 'proportional-symbol' && m.spatialData?.kind !== 'points') problems.push(`${name}: proportional-symbol spatialData.kind must be "points"`);
    if (['choropleth', 'extrusion', 'reference', 'raster'].includes(m.mapTemplate)) problems.push(`${name}: ${m.mapTemplate} ${m.mapTemplate === 'reference' ? 'shows context layers only' : 'uses country values'}; omit spatialData`);
  }
  if (m.mapTemplate === 'raster' && !/^[a-z0-9][a-z0-9-]{0,40}$/.test(m.raster || '')) problems.push(`${name}: a raster tab needs raster: the name of a layer in data/raster/ (tools/raster_build.py)`);
  if (m.mapTemplate !== 'raster' && m.raster !== undefined) problems.push(`${name}: raster is only for mapTemplate "raster"`);
  return problems;
}

export function validateConfig(c, d3 = globalThis.d3) {
  const problems = [], ids = new Set(), need = (ok, msg) => { if (!ok) problems.push(msg); };
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['map.json must be a JSON object'];
  for (const k of ['source', 'dataFile', 'codeColumn', 'yearColumn']) need(typeof c[k] === 'string' && c[k], `${k} missing`);
  need(Array.isArray(c.maps) && c.maps.length, 'maps is empty');
  c.globe = {basemap: 'lightGray', topography: false, topoFillOpacity: 0.75, ...c.globe};
  need(['none', 'lightGray'].includes(c.globe.basemap), 'globe.basemap must be "none" or "lightGray"');
  c.startView ??= 'flat'; need(['flat', 'globe'].includes(c.startView), 'startView must be "flat" or "globe"');
  c.packageStatus ??= 'draft'; need(['draft', 'final'].includes(c.packageStatus), 'packageStatus must be "draft" or "final"');
  need(!c.mapId || MAP_ID.test(c.mapId), `mapId "${c.mapId}" must look like "IBRD 49374"`);
  need(c.packageStatus !== 'final' || (c.mapId && c.mapDate), 'a final map needs the mapId and mapDate the user gives you (never invent them)');
  c.print = {orientation: 'landscape', dpi: 300, ...c.print};
  need(['landscape', 'portrait'].includes(c.print.orientation), 'print.orientation must be "landscape" or "portrait"');
  need([150, 300, 600].includes(c.print.dpi), 'print.dpi must be 150, 300 or 600');
  need(!c.mapDate || /^\d{4}-(0[1-9]|1[0-2])$/.test(c.mapDate), 'mapDate must be YYYY-MM');
  c.coverage ??= 'world';
  coverageProblems(c.coverage).forEach(p => problems.push(p));
  need([undefined, 0, 1, 2].includes(c.adminLevel), 'adminLevel must be 0 (economies), 1 or 2 (admin units)');
  need(!(c.adminLevel > 0) || Array.isArray(c.coverage?.countries), 'adminLevel 1 and 2 need coverage.countries: admin boundaries come per country (data/admin/)');
  need([undefined, 0, 1, 2].includes(c.adminLines), 'adminLines must be 0, 1 or 2 (admin lines from the WB boundary tiles)');
  const CONTEXT = ['lakes', 'rivers', 'roads', 'railways', 'towns', 'elevation'];   // wb-context.js CONTEXT_LAYERS, and the elevation grid
  need(c.context === undefined || Array.isArray(c.context) && c.context.every(l => CONTEXT.includes(l) || /^[a-z0-9][a-z0-9-]{0,40}$/.test(l)) && new Set(c.context).size === c.context.length,
    `context must list layers from ${CONTEXT.join(', ')} or catalog lines and areas in data/context/, each once`);
  need(!c.context?.length || c.coverage?.countries || c.coverage?.bbox, 'context layers need coverage.countries or coverage.bbox (a country or an area)');
  need(!(c.maps || []).some(m => m.mapTemplate === 'reference') || c.context?.length, 'a reference tab needs context layers (context in map.json)');
  need(c.terrain === undefined || c.context?.includes('elevation'), 'terrain needs "elevation" in context (data/context/elevation.json)');
  need(c.terrain === undefined || c.terrain && typeof c.terrain === 'object' && Object.entries(c.terrain).every(([k, v]) => ['hillshade', 'contours', 'tints'].includes(k) && typeof v === 'boolean'),
    'terrain takes hillshade, contours and tints, each true or false');
  for (const m of Array.isArray(c.maps) ? c.maps : []) {
    const name = `map "${m.id}"`;
    need(m.id && !ids.has(m.id), `${name}: id missing or duplicated`); ids.add(m.id);
    for (const k of ['title', 'legendTitle']) need(m[k], `${name}: ${k} missing`);
    if (m.type === 'timeseries') for (const k of ['dataFile', 'codeColumn', 'nameColumn']) need(m[k], `${name}: ${k} missing`);
    else need(m.column, `${name}: column missing`);
    if (m.palette && m.colors) problems.push(`${name}: give palette or colors, not both`);
    else if (m.palette) {
      try { m.colors = paletteColors(m.palette, m.classes ?? DEFAULT_CLASSES, d3); } catch (err) { problems.push(`${name}: ${err.message}`); }
    } else if (m.mapTemplate === 'raster' && !m.colors) { /* a categorical raster takes its class colors from data/raster/; a continuous one needs palette (checked on load) */ }
    else if (!Array.isArray(m.colors) || m.colors.length < 2) problems.push(`${name}: set palette (e.g. "Blues") or list at least 2 colors`);
    else if (m.colors.some(x => !/^#[0-9a-f]{6}$/i.test(x))) problems.push(`${name}: colors must be #rrggbb`);
    else if (paletteProblem(m.colors, d3)) problems.push(`${name}: ${paletteProblem(m.colors, d3)}`);
    mapTemplateProblems(m, name).forEach(x => problems.push(x));
    if (m.dashboard !== undefined) dashboardProblems(m, name).forEach(x => problems.push(x));
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Coverage (map.json "coverage"): the part of the world a map is about. Economies inside it carry the data;
// the rest are neighbors in COLORS.outside, with no value. Views, "home" and exports fit the coverage's own
// economies (not territories or overseas parts such as La Réunion), or coverage.bbox when given.
// Regions are the WB_REGION codes of the World Bank Global Administrative Divisions service (geometry.json).
export const REGIONS = {
  AFE: 'Eastern and Southern Africa', AFW: 'Western and Central Africa', SSF: 'Sub-Saharan Africa',
  EAS: 'East Asia and Pacific', ECS: 'Europe and Central Asia', LCN: 'Latin America and the Caribbean',
  MEA: 'Middle East, North Africa, Afghanistan and Pakistan', NAC: 'North America', SAS: 'South Asia'
};
export const PROJECTIONS = ['auto', 'equalEarth', 'azimuthalEqualArea', 'conicEqualArea', 'transverseMercator'];
const validBbox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] !== b[2] &&
  Math.abs(b[0]) <= 180 && Math.abs(b[2]) <= 180 && b[1] >= -90 && b[3] <= 90 && b[1] < b[3];
function coverageProblems(cov) {
  if (cov === 'world') return [];
  if (!cov || typeof cov !== 'object' || Array.isArray(cov)) return ['coverage must be "world" or an object with region, countries or bbox'];
  const problems = [], need = (ok, msg) => { if (!ok) problems.push(msg); };
  need(['region', 'countries', 'bbox'].some(k => cov[k] !== undefined), 'coverage needs region, countries or bbox');
  need(cov.region === undefined || cov.countries === undefined, 'coverage: give region or countries, not both');
  need(cov.region === undefined || Object.hasOwn(REGIONS, cov.region), `coverage.region must be one of ${Object.keys(REGIONS).join(', ')}`);
  need(cov.countries === undefined || Array.isArray(cov.countries) && cov.countries.length && cov.countries.every(c => /^[A-Z]{3}$/.test(c)),
    'coverage.countries must list ISO3 codes such as "KEN"');
  need(!cov.countries?.includes?.(TAIWAN.code), 'coverage.countries: Taiwan, China is part of China\'s polygon; use CHN');
  need(cov.bbox === undefined || validBbox(cov.bbox), 'coverage.bbox must be [west, south, east, north] in degrees');
  need(cov.padding === undefined || typeof cov.padding === 'number' && cov.padding >= 0 && cov.padding <= 0.5, 'coverage.padding must be a number from 0 to 0.5');
  need(cov.projection === undefined || PROJECTIONS.includes(cov.projection), `coverage.projection must be one of ${PROJECTIONS.join(', ')}`);
  const extra = Object.keys(cov).filter(k => !['region', 'countries', 'bbox', 'padding', 'projection'].includes(k));
  need(!extra.length, `coverage: unknown setting ${extra.join(', ')}`);
  return problems;
}
const lonOverlap = (a0, a1, b0, b1) => {   // longitude ranges; a box may cross the antimeridian (west > east)
  const parts = (w, e) => w <= e ? [[w, e]] : [[w, 180], [-180, e]];
  return parts(a0, a1).some(([p, q]) => parts(b0, b1).some(([r, t]) => p <= t && r <= q));
};
const polygonsOf = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const inBox = (f, [w, s, e, n]) => polygonsOf(f.geometry).some(p => {
  const [[x0, y0], [x1, y1]] = bounds({geometry: {coordinates: p}});
  return y0 <= n && y1 >= s && lonOverlap(x0, x1, w, e);
});
// The coverage of a validated map.json: {kind, label, inside(feature), extent (GeoJSON to fit), projection, padding}.
export function coverageOf(c, countries) {
  const cov = c.coverage ?? 'world';
  if (cov === 'world') return {kind: 'world', label: 'World', inside: () => true, extent: null, projection: 'equalEarth', padding: 0};
  const inside = cov.region ? f => String(f.properties.WB_REGION || '').split(',').includes(cov.region)
    : cov.countries ? f => cov.countries.includes(f.properties.ISO_A3) : f => inBox(f, cov.bbox);
  const members = countries.filter(inside), own = members.filter(f => f.properties.WB_A3 === f.properties.ISO_A3 && f.properties.WB_STATUS !== 'Territory');
  const unknown = (cov.countries || []).filter(code => !members.some(f => f.properties.ISO_A3 === code));
  if (unknown.length) throw new Error(`coverage.countries: no polygon for ${unknown.join(', ')}`);
  if (!members.length) throw new Error('coverage contains no economy');
  const kind = cov.region ? 'region' : cov.countries ? 'countries' : 'area';
  let extent = {type: 'FeatureCollection', features: own.length ? own : members};
  if (cov.bbox) {   // the box's edges, densified so any projection fits the whole box
    const [w, s, e, n] = cov.bbox, span = (e - w + 360) % 360 || 360, edge = [];
    for (let i = 0; i <= 16; i++) { const x = w + span * i / 16; edge.push([x > 180 ? x - 360 : x, s], [x > 180 ? x - 360 : x, n]); }
    for (let i = 1; i < 16; i++) edge.push([w, s + (n - s) * i / 16], [e, s + (n - s) * i / 16]);
    extent = {type: 'MultiPoint', coordinates: edge};
  }
  const label = cov.region ? REGIONS[cov.region] : cov.countries ? members.filter(f => f.properties.WB_A3 === f.properties.ISO_A3).map(namePlain).filter((x, i, a) => a.indexOf(x) === i).join(', ') : 'Area of interest';
  return {kind, label, inside, extent, padding: cov.padding ?? 0.06,
    projection: cov.projection && cov.projection !== 'auto' ? cov.projection : kind === 'region' ? 'equalEarth' : 'azimuthalEqualArea'};
}
// The projection for a coverage, before fitting: Equal Earth for the world (as always) and for regions, centred on
// the region; a local equal-area projection centred on a country or area (owner decision, October 2026).
export function coverageProjection(cov, d3 = globalThis.d3) {
  if (cov.kind === 'world') return d3.geoEqualEarth();
  const [lon, lat] = d3.geoCentroid(cov.extent), [[, s], [, n]] = d3.geoBounds(cov.extent);
  if (cov.projection === 'equalEarth') return d3.geoEqualEarth().rotate([-lon, 0]);
  if (cov.projection === 'conicEqualArea') return d3.geoConicEqualArea().parallels([s + (n - s) / 6, n - (n - s) / 6]).rotate([-lon, 0]);
  if (cov.projection === 'transverseMercator') return d3.geoTransverseMercator().rotate([-lon, -lat]);
  return d3.geoAzimuthalEqualArea().rotate([-lon, -lat]);
}
export const PROJECTION_NAMES = {equalEarth: 'Equal Earth', azimuthalEqualArea: 'Lambert azimuthal equal-area',
  conicEqualArea: 'Albers equal-area conic', transverseMercator: 'Transverse Mercator'};

// Dashboard elements below the map (wb-dash.js), per tab. Fills in the defaults.
const DASHBOARD = {kpi: [], bar: ['top', 'order'], dot: ['top', 'order'], lollipop: ['top', 'order'], histogram: [], pie: [], donut: [], line: [], area: [], explorer: ['layout', 'xColumn'], table: ['rows']};
export const RANKED = ['bar', 'dot', 'lollipop'];   // ranked charts: top and order settings
export const CHART_TYPES = Object.keys(DASHBOARD).filter(type => !['kpi', 'table'].includes(type));   // elements that draw marks
function dashboardProblems(m, name) {
  if (!Array.isArray(m.dashboard)) return [`${name}: dashboard must be a list`];
  const problems = [], seen = new Set();
  if (m.dashboard.length > 12) problems.push(`${name}: dashboard supports at most 12 elements`);
  m.dashboard.forEach((e, i) => {
    const where = `${name}: dashboard item ${i + 1}`;
    if (!e || !Object.hasOwn(DASHBOARD, e.type)) return problems.push(`${where}: type must be one of ${Object.keys(DASHBOARD).join(', ')}`);
    const extra = Object.keys(e).filter(k => !['type', 'title', ...DASHBOARD[e.type]].includes(k));
    if (extra.length) problems.push(`${where} (${e.type}): unknown setting ${extra.join(', ')}`);
    if (e.title !== undefined && (typeof e.title !== 'string' || !e.title.trim())) problems.push(`${where}: title must be text`);
    if (RANKED.includes(e.type)) {
      e.top ??= 10; e.order ??= 'highest';
      if (!Number.isInteger(e.top) || e.top < 3 || e.top > 25) problems.push(`${where}: top must be a whole number from 3 to 25`);
      if (!['highest', 'lowest'].includes(e.order)) problems.push(`${where}: order must be "highest" or "lowest"`);
    }
    if (e.type === 'explorer') {
      e.layout ??= 'beeswarm';
      if (!['map', 'scatter', 'beeswarm'].includes(e.layout)) problems.push(`${where}: layout must be "map", "scatter" or "beeswarm"`);
    }
    if (e.type === 'explorer' && e.xColumn !== undefined && (typeof e.xColumn !== 'string' || !e.xColumn.trim())) problems.push(`${where}: xColumn must name a numeric column`);
    if (e.type === 'explorer' && e.layout === 'scatter' && !e.xColumn) problems.push(`${where}: scatter layout needs xColumn for a second numeric measure`);
    if (e.type === 'table') {
      e.rows ??= 10;
      if (!Number.isInteger(e.rows) || e.rows < 5 || e.rows > 50) problems.push(`${where}: rows must be a whole number from 5 to 50`);
    }
    if (['line', 'area'].includes(e.type) && m.type !== 'timeseries') problems.push(`${where}: a ${e.type} chart needs a timeseries tab`);
    const key = e.type === 'bar' ? `bar-${e.order}` : e.type;
    if (seen.has(key)) problems.push(`${where}: ${key} is listed twice`);
    seen.add(key);
  });
  return problems;
}

// The map stamp, on screen next to the source and in every export; and the export file-name prefix.
export function stampText(c) {
  if (!c.mapId || c.packageStatus !== 'final') return 'DRAFT – NOT FOR PUBLICATION';
  const [y, mo] = (c.mapDate || '').split('-').map(Number);
  const month = y ? new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'}).toUpperCase() : '';
  return [c.mapId, month].filter(Boolean).join(' | ');
}
export const stampFileName = c => c.mapId && c.packageStatus === 'final' ? c.mapId.replace(/\s+/g, '') : 'DRAFT';
export const LOGO = 'assets/gcs-logo.svg';   // GCS logo: footer and every export

// ---------------------------------------------------------------------------
// International boundaries: WB_GAD_Boundaries vector tiles (never draw country
// outlines as borders). _symbol classes come from the service's root.json.
// Dashes are in multiples of the line width, as MapLibre counts them.
export const BOUNDARY_SERVICE = 'https://vectortileservices.arcgis.com/iQ1dY19aHwbSDYIF/arcgis/rest/services/WB_GAD_Boundaries/VectorTileServer';
export const BOUNDARY_CATEGORIES = [
  {symbol: 2, name: 'solid',  dash: null},
  {symbol: 1, name: 'dashed', dash: [3.75, 3.75]},
  {symbol: 0, name: 'dotted', dash: [0.75, 4]}
];
export const BORDER_WIDTH = 0.65;
// Admin 1 and 2 lines: the same tile service's ADM1_Boundaries (from z4) and ADM2_Boundaries (from z6), white like the
// international borders, thinner, drawn below them and only on admin maps (owner sign-off October 2026; widths approved
// by the owner for now, 2026-10-17, open to Cartography review).
export const ADMIN_LINES = [
  {level: 1, layer: 'ADM1_Boundaries', minzoom: 4, width: 0.4},
  {level: 2, layer: 'ADM2_Boundaries', minzoom: 6, width: 0.2}
];

// Tiles {x, y, z} covering a lon/lat box at zoom z (whole world by default).
export function boundaryTiles(z, [[west, south], [east, north]] = [[-180, -85], [180, 85]]) {
  const n = 2 ** z, clampLat = v => Math.max(-85, Math.min(85, v));
  const tx = lon => Math.min(n - 1, Math.max(0, Math.floor((lon + 180) / 360 * n)));
  const ty = lat => Math.min(n - 1, Math.max(0, Math.floor((1 - Math.log(Math.tan(Math.PI / 4 + clampLat(lat) * Math.PI / 360)) / Math.PI) / 2 * n)));
  const tiles = [];
  for (let y = ty(north); y <= ty(south); y++) for (let x = tx(west); x <= tx(east); x++) tiles.push({x, y, z});
  return tiles;
}

// Boundary lines (GeoJSON LineStrings with _symbol) for a set of tiles. Each tile
// is fetched once per page. Tiles are clipped to their own extent, so dashed
// lines never turn solid at tile seams. layer: ADM0_Boundaries (international), or an ADMIN_LINES layer.
const tileCache = new Map();
export async function loadBoundaries(tiles, layer = 'ADM0_Boundaries') {
  const queue = [...tiles], results = [];
  await Promise.all(Array.from({length: 6}, async () => {
    while (queue.length) {
      const t = queue.shift(), key = `${t.z}/${t.y}/${t.x}`;
      if (!tileCache.has(key)) tileCache.set(key, fetchTile(t).catch(e => { tileCache.delete(key); throw e; }));
      results.push((await tileCache.get(key))[layer] || []);
    }
  }));
  return results.flat();
}
async function fetchTile({x, y, z}) {
  const response = await fetch(`${BOUNDARY_SERVICE}/tile/${z}/${y}/${x}.pbf`, {signal: AbortSignal.timeout(20000)});
  if (response.status === 404 || response.status === 204) return {};
  if (!response.ok) throw new Error(`World Bank boundary tiles: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length ? decodeTile(bytes, x, y, z) : {};
}
// The whole world at z3: enough for a world view on screen and for exports.
let worldPromise;
export function loadWorldBoundaries() {
  return worldPromise ||= loadBoundaries(boundaryTiles(3, [[-180, -60], [180, 85]])).then(features => {
    if (!features.length) throw new Error('World Bank boundary tiles contained no international boundaries');
    return features;
  }).catch(e => { worldPromise = null; throw e; });
}

function clipSegment(a, b, extent) {
  let start = 0, end = 1; const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x], [dx, extent - a.x], [-dy, a.y], [dy, extent - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) start = Math.max(start, t); else end = Math.min(end, t);
    if (start > end) return null;
  }
  if (start === end) return null;
  return [{x: a.x + start * dx, y: a.y + start * dy}, {x: a.x + end * dx, y: a.y + end * dy}];
}
function decodeTile(bytes, x, y, z) {
  const layers = new VectorTile(new Pbf(bytes)).layers, out = {};
  for (const name of ['ADM0_Boundaries', ...ADMIN_LINES.map(a => a.layer)]) if (layers[name]) out[name] = decodeLines(layers[name], name === 'ADM0_Boundaries', x, y, z);
  return out;
}
function decodeLines(layer, international, x, y, z) {
  const features = [], n = 2 ** z;
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 2) continue;
    if (international && !BOUNDARY_CATEGORIES.some(c => c.symbol === feature.properties._symbol)) throw new Error('Unknown World Bank boundary symbol');
    const extent = layer.extent;
    const coordinate = p => [(x + p.x / extent) / n * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + p.y / extent) / n))) * 180 / Math.PI];
    for (const line of feature.loadGeometry()) {
      let current = [];
      const flush = () => { if (current.length > 1) features.push({type: 'Feature', properties: {_symbol: feature.properties._symbol}, geometry: {type: 'LineString', coordinates: current}}); current = []; };
      for (let j = 1; j < line.length; j++) {
        const segment = clipSegment(line[j - 1], line[j], extent);
        if (!segment) { flush(); continue; }
        const [a, b] = segment.map(coordinate), last = current.at(-1);
        if (last && (Math.abs(last[0] - a[0]) > 1e-8 || Math.abs(last[1] - a[1]) > 1e-8)) flush();
        if (!current.length) current.push(a);
        current.push(b);
      }
      flush();
    }
  }
  return features;
}

// ---------------------------------------------------------------------------
// Country names: WB_GAD ADM0 label points (official names, abbreviations,
// territory flag, scale rank). Never label countries from any other source.
export const LABEL_POINTS = 'https://services.arcgis.com/iQ1dY19aHwbSDYIF/arcgis/rest/services/WB_GAD/FeatureServer/1';
const NEVER_LABEL = ['Northern Cyprus'];
const LABEL_FIXES = {'Hong Kong, SAR': 'Hong Kong SAR, China', 'Macau, SAR': 'Macao SAR, China', 'Taiwan': 'Taiwan, China'};
// Larger countries (low scalerank) appear first; smaller ones as you zoom in.
// [lowest rank, highest rank, MapLibre zoom, flat-view zoom factor]
export const RANK_BANDS = [[1, 2, 0, 1], [3, 3, 1.6, 1.5], [4, 4, 2.4, 2.5], [5, 5, 3.2, 4], [6, 9, 4, 6]];

let namesPromise = null;
export function loadCountryNames() {
  return namesPromise ||= (async () => {
    const r = await fetch(`${LABEL_POINTS}/query?where=1%3D1&outFields=ADM0_NAME,ADM0_ABBR,territory,justify,scalerank&f=geojson`);
    if (!r.ok) throw new Error(`Country names unavailable (HTTP ${r.status})`);
    const data = await r.json();
    data.features = data.features.filter(f => !NEVER_LABEL.includes(f.properties.ADM0_NAME));
    for (const f of data.features) for (const k of ['ADM0_NAME', 'ADM0_ABBR'])
      f.properties[k] = LABEL_FIXES[f.properties[k]] || f.properties[k];
    for (const f of data.features) if (f.properties.ADM0_NAME === TAIWAN.name) f.properties.ADM0_ABBR = TAIWAN.name;   // never "Taiwan" alone
    return data;
  })().catch(e => { namesPromise = null; throw e; });
}

// ---------------------------------------------------------------------------
// Disputed areas (NDLSA). Fill = average of the claimants' display colors.
// One claimant = fill as that country. Not listed = noData gray (never guess).
export const CLAIMANTS = {
  'Aksai Chin': ['CHN', 'IND'], 'Chumar East': ['CHN', 'IND'], 'Chumar West': ['CHN', 'IND'],
  'Demchok': ['CHN', 'IND'], 'Jadh Ganga Valley': ['CHN', 'IND'], 'Kauirik': ['CHN', 'IND'],
  'Lapthal': ['CHN', 'IND'], 'Shipki Pass': ['CHN', 'IND'], 'Arunachal Pradesh': ['CHN', 'IND'],
  'Karakoram Range': ['CHN', 'PAK', 'IND'], 'Doklam': ['CHN', 'BTN'], 'Kalapani': ['IND', 'NPL'],
  'Golan Heights': ['ISR', 'SYR'], 'Shebaa Farms Dispute': ['ISR', 'LBN', 'SYR'],
  'Abyei': ['SDN', 'SSD'], 'Ilemi Triangle': ['KEN', 'SSD'],
  'Gilgit Baltistan': ['PAK']
  // 'Jammu and Kashmir': split at the line of control, see ndlsaClaimants().
  // Falkland Islands, South Georgia, BIOT, UN Buffer Zone, No Man's Land: noData gray.
};

export const ndlsaName = f => String(f.properties.NAM_0 || '').trim();

export function ndlsaClaimants(f) {
  const name = ndlsaName(f);
  if (name === 'Jammu and Kashmir') return [bboxCenter(f)[0] < 75.5 ? 'PAK' : 'IND'];
  return CLAIMANTS[name] || null;
}

// colorOf(iso3) must return the country's current display color (noData if missing).
export function ndlsaColor(f, colorOf) {
  if (ndlsaName(f) === 'Western Sahara') return COLORS.westernSahara;
  const claimants = ndlsaClaimants(f);
  return claimants ? averageHex(claimants.map(colorOf)) : COLORS.noData;
}

export function averageHex(colors) {
  return '#' + [1, 3, 5].map(i => Math.round(colors.reduce((s, c) => s + parseInt(c.slice(i, i + 2), 16), 0) / colors.length)
    .toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Joining data to polygons. Join on codes, never names.
// Own ISO_A3 row wins; otherwise inherit the WB_A3 parent (Guadeloupe, French
// Guiana, Martinique, Mayotte, La Réunion → France). Returns {row, inheritedFrom}.
const ALIASES = {JEY: 'CHI', GGY: 'CHI'};  // Channel Islands report as CHI

export function lookupRow(props, table) {
  const own = table.get(props.ISO_A3) || table.get(ALIASES[props.ISO_A3]);
  if (own) return {row: own, inheritedFrom: null};
  if (props.WB_A3 && props.WB_A3 !== props.ISO_A3 && table.has(props.WB_A3))
    return {row: table.get(props.WB_A3), inheritedFrom: props.WB_A3};
  return {row: null, inheritedFrom: null};
}

// Taiwan, China: part of China's polygon and always colored with China's value.
// Its own value (TWN) is shown only in its card, always with taiwanNote().
export const TAIWAN = {code: 'TWN', name: 'Taiwan, China', parent: 'CHN', point: [121, 23.7]};

// The ring of China's polygon that is Taiwan, as its own feature for cards and search.
export function taiwanFeature(china) {
  const polygons = china.geometry.type === 'Polygon' ? [china.geometry.coordinates] : china.geometry.coordinates;
  const rings = polygons.find(p => inPolygon(p, TAIWAN.point));
  if (!rings) throw new Error('Taiwan, China not found in China\'s polygon (geometry.json changed?)');
  return {type: 'Feature', properties: {ISO_A3: TAIWAN.code, WB_A3: TAIWAN.code, NAM_0: TAIWAN.name},
    geometry: {type: 'Polygon', coordinates: rings}};
}
export const onTaiwan = (taiwan, [lng, lat]) => inPolygon(taiwan.geometry.coordinates, [lng, lat]);
function inPolygon([outer, ...holes], point) {
  const inRing = ring => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return inRing(outer) && !holes.some(inRing);
}

// Required note in Taiwan, China's card. valueOf(iso3) returns the formatted
// value ('No data' when missing). Wording set by the map owner; don't edit.
export const taiwanNote = valueOf =>
  `The color-coding on this map for Taiwan, China represents the data value for China, which is ${valueOf('CHN')}. ` +
  `The data value for Taiwan, China is ${valueOf('TWN')}.`;

// Official display name, keeping required italics (territories, Western Sahara…).
// French overseas departments are labeled "France" in the geometry; name them.
const TERRITORY_NAMES = {GLP: 'Guadeloupe (Fr.)', GUF: 'French Guiana (Fr.)', MTQ: 'Martinique (Fr.)',
  MYT: 'Mayotte (Fr.)', REU: 'La Réunion (Fr.)', CPT: 'Clipperton Island (Fr.)'};
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function officialName(props) {
  if (TERRITORY_NAMES[props.ISO_A3]) return {name: TERRITORY_NAMES[props.ISO_A3], italic: true};
  const t = document.createElement('template');
  t.innerHTML = props.label_html || props.NAM_0 || '';
  return {name: t.content.textContent.trim(), italic: !!t.content.querySelector('i,em')};
}
export function nameHTML(props) {
  const {name, italic} = officialName(props);
  return italic ? `<i>${esc(name)}</i>` : esc(name);
}
export const namePlain = props => officialName(props).name;

// Numbers: '.' decimal only. Blank = missing (null). Anything else is an error,
// never silently stripped (a "-0,21" must not become -21).
export function parseNumber(text, where = '') {
  const s = String(text ?? '').trim();
  if (s === '' || /^(na|n\/a|\.\.|-)$/i.test(s)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Not a valid number "${s}" ${where}`);
  return Number(s);
}

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// ---------------------------------------------------------------------------
export function bounds(f) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  (function visit(c) {
    if (typeof c[0] === 'number') { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); }
    else c.forEach(visit);
  })(f.geometry.coordinates);
  return [[minX, minY], [maxX, maxY]];
}
const bboxCenter = f => { const [[a, b], [c, d]] = bounds(f); return [(a + c) / 2, (b + d) / 2]; };

export function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
