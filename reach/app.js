// app.js — the map's behavior: data loading, legend, cards, search, views, exports.
// Part of the standard (locked): a map is map.json + data/. WB cartography rules live in
// wb-carto.js, the flat view in wb-flat.js and the globe in wb-globe.js.
import {
  COLORS, DISCLAIMER, ndlsaColor, ndlsaName, lookupRow, nameHTML, namePlain, esc, parseCSV, parseNumber,
  download, formatNumber, TAIWAN, taiwanFeature, onTaiwan, taiwanNote, validateConfig, stampText, stampFileName,
  NO_DATA_LABEL, LOGO, RANKED, coverageOf
} from './wb-carto.js';
import {createFlatMap, buildFigureSVG, figurePNG, printFigure} from './wb-flat.js';
import {createDashboard, chartFigure, dashTitle} from './wb-dash.js';
import {parseSpatialData} from './wb-spatial.js';
import {templateData, TEMPLATE_NAMES} from './wb-map-templates.js';
import {loadAdminUnits, loadAdminNames} from './wb-admin.js';
import {loadContext, contextLegend, symbolSVG, loadSymbols} from './wb-context.js';
import {loadElevation, terrainLegend} from './wb-terrain.js';
import {decodeGrid, cellAt} from './wb-raster.js';

// map.json (see map.schema.json): tabs, columns, palettes, source line, stamp. In the builder's preview
// (?preview=1) the parent page sends map.json and the CSVs instead, so nothing leaves the browser.
const params = new URLSearchParams(location.search);
let CONFIG, previewFiles = null;
async function loadConfig() {
  if (params.has('preview')) {
    const msg = await new Promise(resolve => {
      addEventListener('message', function on(e) {
        if (e.origin === location.origin && e.data?.type === 'wbmap-preview') { removeEventListener('message', on); resolve(e.data); }
      });
      parent.postMessage({type: 'wbmap-preview-ready'}, location.origin);
    });
    previewFiles = msg.files || {};
    return structuredClone(msg.config);
  }
  const r = await fetch('map.json');
  if (!r.ok) throw new Error(`Cannot load map.json (HTTP ${r.status}).`);
  try { return await r.json(); } catch (err) { throw new Error('map.json is not valid JSON: ' + err.message); }
}
const fetchText = async path => {
  if (previewFiles && path in previewFiles) return previewFiles[path];
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Cannot load ${path} (HTTP ${r.status}).`);
  return r.text();
};

// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const notify = (text, ms = 4000) => { status(text); setTimeout(() => { if ($('status').textContent === text) status(''); }, ms); };
const reportError = err => { console.error(err); notify('Part of the map failed to load: ' + (err?.message || 'please reload.'), 6000); };
let geometry, table, current, ready = false;
let flat, globe, view;      // view = the map on screen (flat or globe); both share one interface
let dash;                   // the dashboard below the map (map.json "dashboard" per tab)
let observationPinned=false, observationTarget=null, restoringObservationFocus=false;
let hovered = null, selected = null, cardPoint = null, filter = null;
let year = null, playTimer = null;   // selected year and play/pause state for timeseries maps
const state = new Map();       // country feature id -> {value, year, inheritedFrom, cls, color}
const ndlsaColors = new Map(); // disputed-area feature id -> color
let china, taiwan, taiwanState;   // Taiwan, China: drawn as China; own value in its card only
let economies, byIso;             // the first polygon of each economy (some have several), and the same by ISO code
let coverage, insideIds, insideCodes, shown;   // map.json coverage: polygons and codes inside it; shown = economies inside it
let adminDictionary = null;       // admin maps (adminLevel 1 or 2): code -> unit of data/admin/dictionary.json
const unitWord = () => CONFIG.adminLevel ? `admin ${CONFIG.adminLevel} unit` : 'country';
const NOUN = () => CONFIG.adminLevel ? {one: 'area', many: 'areas'} : {one: 'economy', many: 'economies'};
let context = {layers: {}, attribution: ''};   // map.json context layers (data/context/) and their attribution
let terrain = null;   // {grid, hillshade, contours, tints}: the elevation grid and how map.json draws it
const featureLegend = () => [...contextLegend(context.layers), ...(terrain ? terrainLegend(terrain.grid, terrain) : [])];
const rasterCredit = () => [...new Set(CONFIG.maps.filter(m => m.rasterInfo).map(m => m.rasterInfo.attribution))].join(' · ');
const sourceLine = () => [CONFIG.source, context.attribution, rasterCredit() && 'Raster: ' + rasterCredit()].filter(Boolean).join(' · ');   // on screen and in every export
const OUTSIDE = {value: null, year: null, inheritedFrom: null, cls: 'out', color: COLORS.outside, outside: true};   // a neighbor
const inCoverage = row => coverage.kind === 'world' || insideCodes.has(row.code);
const stateOf = f => f === taiwan ? taiwanState : state.get(f.id);
const mapFeature = f => f === taiwan ? china : f;   // the polygon that is drawn and outlined
const featureByIso = iso => byIso.get(iso);
const centroids = new WeakMap();   // shapes never change, so each centroid is computed once, on first use
const centroidOf = f => centroids.get(f) ?? centroids.set(f, d3.geoCentroid(f)).get(f);
const filled = m => ['choropleth', 'extrusion'].includes(m.mapTemplate || 'choropleth');   // country fills carry the data

const currentFromHash = () => CONFIG.maps.find(m => m.id === location.hash.slice(1)) || CONFIG.maps[0];
const fmt = (v, m) => formatNumber(v, {decimals: m.decimals, prefix: m.prefix, suffix: m.unit});

function classify(v, m) {
  if (v == null) return {cls: 'na', color: COLORS.noData};
  const i = m.breaks.findIndex(b => v < b);
  const cls = i === -1 ? m.breaks.length : i;
  return {cls: String(cls), color: m.colors[cls]};
}
function classLabels(m) {
  const b = m.breaks.map(v => fmt(v, m)), bare = m.breaks.map(v => fmt(v, {...m, unit: ''}));   // "36.9–54.1%"
  return m.colors.map((color, i) => ({cls: String(i), color,
    label: !b.length ? 'No observed values' : i>0 && i<b.length && m.breaks[i-1]===m.breaks[i] ? `Empty interval at ${b[i]}` : i === 0 ? `Less than ${b[0]}` : i === b.length ? `${b[i - 1]} or more` : `${bare[i - 1]}–${b[i]}`}));
}

// Jenks natural breaks: picks class limits that minimize within-class variance.
// Returns the ascending interior breaks (numClasses - 1 values).
function jenksBreaks(values, numClasses) {
  let data = [...new Set(values)].sort((a, b) => a - b);
  if (!data.length) return [];
  if (data.length <= numClasses) {const limits=data.slice(1);while(limits.length<numClasses-1)limits.push(data.at(-1));return limits;}
  const cap = 1500;   // the O(n^2) DP below is too slow on large timeseries samples; downsample first
  if (data.length > cap) data = data.filter((_, i) => i % Math.ceil(data.length / cap) === 0);
  const n = data.length;
  const lowerClassLimits = Array.from({length: n + 1}, () => Array(numClasses + 1).fill(0));
  const varCombinations = Array.from({length: n + 1}, () => Array(numClasses + 1).fill(Infinity));
  for (let i = 1; i <= numClasses; i++) { lowerClassLimits[1][i] = 1; varCombinations[1][i] = 0; }
  for (let l = 2; l <= n; l++) {
    let sum = 0, sumSquares = 0, w = 0, variance = 0;
    for (let m = 1; m <= l; m++) {
      const lowerClassLimit = l - m + 1, val = data[lowerClassLimit - 1];
      w++; sum += val; sumSquares += val * val;
      variance = sumSquares - (sum * sum) / w;
      if (lowerClassLimit > 1) {
        for (let j = 2; j <= numClasses; j++) {
          const candidate = variance + varCombinations[lowerClassLimit - 1][j - 1];
          if (varCombinations[l][j] >= candidate) { lowerClassLimits[l][j] = lowerClassLimit; varCombinations[l][j] = candidate; }
        }
      }
    }
    lowerClassLimits[l][1] = 1; varCombinations[l][1] = variance;
  }
  const limits = [];
  let k = n, j = numClasses;
  while (j > 1) { const id = lowerClassLimits[k][j] - 1; limits.unshift(data[id]); k = id; j--; }
  return limits;
}
// countryBreaks class the countries; breaks class what the legend shows: a spatial layer's own values, if it has them.
function computeBreaks(m) {
  if (m.mapTemplate === 'raster') {   // Jenks on the cells (an even sample), for continuous rasters
    const v = m.rasterGrid.values, step = Math.max(1, Math.floor(v.length / 20000)), sample = [];
    for (let i = 0; i < v.length; i += step) if (Number.isFinite(v[i])) sample.push(v[i]);
    m.breaks = m.countryBreaks = m.rasterInfo.kind === 'categorical' ? [] : jenksBreaks(sample, m.colors.length);
    return;
  }
  const values = m.type === 'timeseries' ? [...m.table.values()].filter(inCoverage).flatMap(r => Object.values(r.years)) : [...table.values()].filter(inCoverage).map(r => r[m.column]);
  m.countryBreaks = jenksBreaks(values.filter(v => v != null), m.colors.length);
  m.breaks = m.spatialParsed && m.spatialData.valueColumn && m.mapTemplate !== 'heatmap'
    ? jenksBreaks(m.spatialParsed.rows.map(r => r.value).filter(v => v != null), m.colors.length) : m.countryBreaks;
}
const countryClasses = m => ({...m, breaks: m.countryBreaks});

// Codes in the data with no polygon. TWN is expected (drawn inside China); CHI covers Jersey + Guernsey.
function unknownCodes(codes) {
  const known = new Set([...geometry.countries.features.flatMap(f => [f.properties.ISO_A3, f.properties.WB_A3]), TAIWAN.code, 'CHI']);
  return codes.filter(c => !known.has(c));
}

// The explorer's second (x) columns that these tabs read from their file.
const explorerColumns = maps => [...new Set(maps.flatMap(m => (m.dashboard || []).filter(item => item.type === 'explorer' && item.xColumn).map(item => item.xColumn)))];
const numbers = (r, columns, line) => Object.fromEntries(columns.map(c => [c, parseNumber(r[c], `(row ${line}, ${c})`)]));
// One entry per code; a missing or duplicate code stops the map. Codes with no polygon are kept and listed in .unknown.
function byCode(rows, file, codeColumn, entry) {
  const out = new Map();
  rows.forEach((r, i) => {
    const code = r[codeColumn].toUpperCase();
    if (!code) throw new Error(`Row ${i + 2}: missing ${codeColumn}`);
    if (out.has(code)) throw new Error(`Duplicate code ${code} in ${file}`);
    out.set(code, entry(r, code, i + 2));
  });
  out.unknown = unknownCodes([...out.keys()]);
  if (out.unknown.length) console.warn(`Codes with no polygon in ${file} (check spelling or aliases):`, out.unknown.join(', '));
  return out;
}

// Wide-format CSV (one column per year) for an animated time series map.
function loadSeriesTable(text, m) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error(`${m.dataFile} has no data rows`);
  for (const c of [m.codeColumn, m.nameColumn]) if (!(c in rows[0])) throw new Error(`${m.dataFile} is missing column "${c}". Found: ${Object.keys(rows[0]).join(', ')}`);
  const extraColumns = explorerColumns([m]);
  for (const column of extraColumns) if (!(column in rows[0])) throw new Error(`${m.dataFile} is missing explorer x column ${column}`);
  const yearCols = Object.keys(rows[0]).filter(c => /^\d{4}$/.test(c)).sort();
  if (!yearCols.length) throw new Error(`${m.dataFile} has no year columns (expected headers like 2000, 2001…)`);
  m.years = yearCols.map(Number);
  return byCode(rows, m.dataFile, m.codeColumn, (r, code, line) => ({code, name: r[m.nameColumn], years: numbers(r, yearCols, line), values: numbers(r, extraColumns, line)}));
}

// ---------------------------------------------------------------------------
async function start() {
  if (location.protocol === 'file:') throw new Error('Open it through a local web server (see README), not by double-clicking index.html.');
  CONFIG = await loadConfig();
  const problems = validateConfig(CONFIG);
  if (problems.length) throw new Error('Check map.json: ' + problems.join('; '));
  status('Loading map…');
  buildTabs(); initViewTools();
  const seriesMaps = CONFIG.maps.filter(m => m.type === 'timeseries');
  const [g, csv, ...series] = await Promise.all([fetch('data/geometry.json').then(r => {
    if (!r.ok) throw new Error(`Cannot load data/geometry.json (HTTP ${r.status}).`); return r.json(); }),
    fetchText(CONFIG.dataFile), ...seriesMaps.map(m => fetchText(m.dataFile))]);
  geometry = g;
  // Coverage: economies inside carry the data; the rest are neighbors (COLORS.outside) with no value. On an admin map
  // the covered countries are replaced by their admin units (data/admin/), which then carry the data.
  coverage = coverageOf(CONFIG, geometry.countries.features);
  if (CONFIG.adminLevel) {
    const admin = await loadAdminUnits(CONFIG.adminLevel, CONFIG.coverage.countries, fetchText);
    geometry.countries.features = [...geometry.countries.features.filter(f => !coverage.inside(f)), ...admin.units];
    coverage.inside = f => f.properties.unit === CONFIG.adminLevel;
    adminDictionary = admin.dictionary;
  }
  context = await loadContext(CONFIG.context, fetchText);
  if (CONFIG.maps.some(m => m.mapTemplate === 'locator')) await loadSymbols(['project-location'], fetchText);   // its sites
  // Raster tabs: their grid and its recipe record (data/raster/), classed like any tab or colored by category.
  const rasters = CONFIG.maps.some(m => m.mapTemplate === 'raster') ? JSON.parse(await fetchText('data/raster/manifest.json')).layers : {};
  for (const m of CONFIG.maps.filter(m => m.mapTemplate === 'raster')) {
    if (!rasters[m.raster]) throw new Error(`map "${m.id}": data/raster/${m.raster}.json is not built (tools/raster_build.py)`);
    m.rasterInfo = rasters[m.raster];
    m.rasterGrid = decodeGrid(JSON.parse(await fetchText(`data/raster/${m.raster}.json`)));
    if (m.rasterInfo.kind === 'categorical') m.colors = m.rasterInfo.categories.map(c => c.color);
    else if (!m.colors) throw new Error(`map "${m.id}": a continuous raster needs palette (e.g. "OrRd")`);
  }
  if (CONFIG.context?.includes('elevation')) terrain = {hillshade: true, contours: false, tints: false, ...CONFIG.terrain, grid: await loadElevation(fetchText)};
  $('source').textContent = sourceLine();
  table = loadTable(csv);
  seriesMaps.forEach((m, i) => { m.table = loadSeriesTable(series[i], m); });
  await Promise.all(CONFIG.maps.filter(m => m.spatialData).map(async m => {
    m.spatialParsed = parseSpatialData(parseCSV(await fetchText(m.spatialData.dataFile)), m.spatialData, {mapTemplate: m.mapTemplate});
    m.spatialYears = m.spatialParsed.years.map(Number);
  }));
  geometry.countries.features.forEach((f, i) => { f.id = i; });
  geometry.ndlsa.features.forEach((f, i) => { f.id = i; });
  byIso = new Map();
  for (const f of geometry.countries.features) if (!byIso.has(f.properties.ISO_A3)) byIso.set(f.properties.ISO_A3, f);
  economies = [...byIso.values()];
  china = featureByIso(TAIWAN.parent);   // none on a map of China's admin units: Taiwan Province is a unit like the others
  taiwan = china ? taiwanFeature(china) : null;
  const inside = geometry.countries.features.filter(coverage.inside);
  insideIds = new Set(inside.map(f => f.id));
  insideCodes = new Set(inside.flatMap(f => [f.properties.ISO_A3, ...(['JEY', 'GGY'].includes(f.properties.ISO_A3) ? ['CHI'] : []), ...(f === china ? [TAIWAN.code] : [])]));
  shown = economies.filter(f => insideIds.has(f.id));
  CONFIG.maps.forEach(computeBreaks);
  buildSearchIndex();
  if (coverage.kind !== 'world') {
    $('map').setAttribute('aria-label', `Interactive map: ${coverage.label}${CONFIG.adminLevel ? `, admin ${CONFIG.adminLevel} units` : ''}`);
    for (const a of ['aria-label', 'title']) $('zoom-home').setAttribute(a, 'Reset map view');
  }
  if (CONFIG.adminLevel) { $('country').labels[0].textContent = 'Find an area'; $('country-list').setAttribute('aria-label', 'Areas'); }
  if (CONFIG.adminLevel || context.layers.towns) $('labels').labels[0].lastChild.textContent = ' Place names';

  const adminNames = CONFIG.adminLevel ? () => loadAdminNames(CONFIG.adminLevel, CONFIG.coverage.countries) : null;
  view = flat = createFlatMap($('flat'), {countries: geometry.countries.features, ndlsa: geometry.ndlsa.features, coverage, adminLevel: CONFIG.adminLevel,
    adminLines: CONFIG.adminLines || 0, adminNames, context: context.layers, terrain, ...handlers});
  dash = createDashboard($('dashboard'), dashHandlers);
  ready = true; render();
  updateViewTools();
  if ($('labels').checked) toggleNames();
  // URL options for sharing and screenshots: ?view=globe, ?focus=IND (zoom to a country).
  if ((params.get('view') || CONFIG.startView) === 'globe') setView(true);
  const focus = featureByIso(params.get('focus')?.toUpperCase());
  if (focus) view.zoomTo(focus);
  // A code of another admin level is named as such: it is reported, never drawn.
  const hint = c => adminDictionary?.has(c) ? `${c} (admin ${adminDictionary.get(c).level})` : c;
  if (table.unknown.length) notify(`${table.unknown.length} code(s) in the data match no ${unitWord()}: ${table.unknown.slice(0, 6).map(hint).join(', ')}${table.unknown.length > 6 ? '…' : ''}`, 8000);
  else if (outsideCodes().length) notify(`${outsideCodes().length} ${NOUN().many} in the data are outside this map's coverage (${coverage.label}) and are not shown.`, 8000);
}
// Data codes with a polygon outside the coverage: not drawn, reported.
const outsideCodes = () => [...new Set([table, ...CONFIG.maps.filter(m => m.table).map(m => m.table)].flatMap(t => [...t.values()]
  .filter(r => !inCoverage(r) && !t.unknown.includes(r.code)).map(r => r.code)))];

function loadTable(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error(`${CONFIG.dataFile} has no data rows`);
  const valueMaps = CONFIG.maps.filter(m => m.type !== 'timeseries'), valueColumns = valueMaps.map(m => m.column);
  const extraColumns = explorerColumns(valueMaps);
  const missing = [CONFIG.codeColumn, CONFIG.yearColumn, ...valueColumns, ...extraColumns].filter(c => !(c in rows[0]));
  if (missing.length) throw new Error(`${CONFIG.dataFile} is missing column(s): ${missing.join(', ')}. Found: ${Object.keys(rows[0]).join(', ')}`);
  return byCode(rows, CONFIG.dataFile, CONFIG.codeColumn, (r, code, line) => ({code, name: CONFIG.nameColumn ? r[CONFIG.nameColumn] : '', year: r[CONFIG.yearColumn],
    values: numbers(r, extraColumns, line), ...numbers(r, valueColumns, line)}));
}

const yearsOf = m => m.type === 'timeseries' ? m.years : m.spatialYears || [];
const currentTable = () => current.type === 'timeseries' ? current.table : table;
// The current map's value and year for one data row (value null when missing).
function valueOfRow(row) {
  const value = row ? (current.type === 'timeseries' ? (row.years[year] ?? null) : row[current.column]) : null;
  return {value, year: current.type === 'timeseries' ? (value != null ? year : null) : row?.year};
}

// Recolor in place; geometry is never redrawn or re-sent to the map.
function render() {
  observationPinned=false;observationTarget=null;
  current = currentFromHash();
  const timeYears = yearsOf(current);
  if (timeYears.length && !timeYears.includes(year)) year = timeYears.at(-1);
  document.title = `${current.title} | World Bank`;
  $('title').textContent = current.type === 'timeseries' ? `${current.title} (${year})` : current.title;
  for (const a of document.querySelectorAll('nav a'))
    a.hash === '#' + current.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  updateTimeUI();
  const colorByIso = new Map(), classes = countryClasses(current);
  for (const f of geometry.countries.features) {
    const {row, inheritedFrom} = lookupRow(f.properties, currentTable());
    const {value, year: rowYear} = valueOfRow(row);
    const s = insideIds.has(f.id) ? {value, year: rowYear, inheritedFrom, ...classify(value, classes)} : OUTSIDE;
    state.set(f.id, s);
    if (!s.outside || !colorByIso.has(f.properties.ISO_A3)) colorByIso.set(f.properties.ISO_A3, s.color);
  }
  // Taiwan, China keeps China's class and color; its own value is for its card only.
  const {cls, color} = china ? state.get(china.id) : OUTSIDE;
  taiwanState = !china || state.get(china.id).outside ? OUTSIDE : {...valueOfRow(currentTable().get(TAIWAN.code)), inheritedFrom: null, cls, color};
  for (const f of geometry.ndlsa.features) ndlsaColors.set(f.id, ndlsaColor(f, iso => colorByIso.get(iso) || COLORS.noData));
  paint(view);
  filter = null; legend();
  renderDashboard();
  renderSpatialTable();
  applyFilter();
  if (selected) showCard(selected, cardPoint, true);
  if (!$('country-list').hidden) showList();
}
const thematicCache=new WeakMap();
function thematicData() {
  const cached=thematicCache.get(current);
  if(cached?.year===year)return cached.data;
  const data=templateData(current,geometry.countries.features.filter(f=>insideIds.has(f.id)),state,year,classify);
  thematicCache.set(current,{year,data});return data;
}
// Fills: data colors on choropleth and elevated tabs, neutral no-data gray on observation tabs; neighbors always COLORS.outside.
// A disputed area blends its claimants' fills, so a claimant outside the coverage counts as a neighbor.
const countryFill = f => state.get(f.id).outside ? COLORS.outside : filled(current) ? state.get(f.id).color : COLORS.noData;
const ndlsaFill = f => filled(current) ? ndlsaColors.get(f.id) : ndlsaColor(f, iso => insideCodes.has(iso) || coverage.kind === 'world' ? COLORS.noData : COLORS.outside);
function paint(v) {
  const kind = current.mapTemplate || 'choropleth', thematic = thematicData();
  v.recolor(countryFill, ndlsaFill);
  if (kind === 'extrusion' && [...state.values()].some(s => s.value != null && s.value < 0)) throw new Error('Elevated regions require nonnegative values; use a choropleth for signed values.');
  v.setTemplate(thematic, f => state.get(f.id));
  if (kind === 'raster' && v.kind === 'globe') return status('Raster layers are drawn in the flat view and in exports.');
  status(kind === 'extrusion' && v.kind === 'flat' ? 'Elevated regions: switch to Globe to see height. Flat view and image exports show the choropleth counterpart.' : thematic.missing ? `${thematic.missing} observation(s) have no sizing value and no symbol. Real zero has zero size.` : '');
}

function buildTabs() {
  $('tabs').innerHTML = CONFIG.maps.map((m, i) => `<a href="#${esc(m.id)}">${String(i + 1).padStart(2, '0')} <span>${esc(m.tab || m.title)}</span></a>`).join('');
  $('tabs').hidden = CONFIG.maps.length < 2;
  $('eyebrow').textContent = CONFIG.eyebrow || '';
  $('source').textContent = CONFIG.source;
  $('stamp').textContent = stampText(CONFIG);
  $('disclaimer').textContent = DISCLAIMER;
}

// ---------------------------------------------------------------------------
// Legend items, the same on screen and in exports: the classes, then "No data".
const legendItems = m => m.mapTemplate === 'reference' ? [] : m.mapTemplate === 'raster'
  ? (m.rasterInfo.kind === 'categorical' ? m.rasterInfo.categories.map(c => ({cls: String(c.value), color: c.color, label: c.label})) : classLabels({...m, unit: '', prefix: ''}))
  : m.mapTemplate === 'locator' ? [{cls: 'observation', svg: 'project-location', label: 'Project location'}]
  : m.mapTemplate === 'heatmap'
  ? m.colors.map((color, i) => ({cls: String(i), color, label: i === 0 ? 'Lower relative density' : i === m.colors.length - 1 ? 'Higher relative density' : 'Relative point density'}))
  : m.spatialData && !m.spatialData.valueColumn || m.mapTemplate === 'route'
    ? [{cls: 'observation', color: m.colors.at(-1), label: m.mapTemplate === 'route' ? 'Ordered route' : m.mapTemplate === 'flow' ? 'Connection' : 'Observation'}]
    : [...classLabels(m.spatialData ? {...m,unit:m.spatialData.unit || '',prefix:'',suffix:''} : m), {cls: 'na', color: COLORS.noData, label: NO_DATA_LABEL}];
const mapLegendTitle = m => m.mapTemplate === 'heatmap' ? 'Point density · equal observation weights' : m.mapTemplate === 'locator' ? 'Locations' : m.mapTemplate === 'route' ? 'Ordered routes' : m.spatialData ? (m.spatialData.valueLabel || m.spatialData.valueColumn || (m.mapTemplate === 'flow' ? 'Connections' : 'Locations')) : m.legendTitle;
function legend() {
  const items = legendItems(current);
  const observationMap = !!current.spatialData || ['proportional-symbol', 'extrusion', 'reference'].includes(current.mapTemplate), features = featureLegend();
  $('legend-body').innerHTML = `<p class="legend-caption">${esc(mapLegendTitle(current))}</p>` +
    (current.mapTemplate === 'proportional-symbol' ? '<p class="hint">Circle area is proportional to value. Zero has zero area.</p>' : current.mapTemplate === 'flow' && current.spatialData?.valueColumn ? '<p class="hint">Connection width scales with the square root of value; zero has zero width.</p>' : current.mapTemplate === 'extrusion' ? '<p class="hint">Globe height is proportional to value, with relative scaling. Image exports show the flat counterpart.</p>' : '') +
    items.map(k => observationMap ? `<div class="key">${k.svg ? symbolSVG(k, 20) : `<i class="swatch" style="background:${k.color}"></i>`}${esc(k.label)}</div>` : `<button class="key" type="button" data-cls="${k.cls}" aria-pressed="false"><i class="swatch" style="background:${k.color}"></i>${esc(k.label)}</button>`).join('') +
    (features.length ? (current.mapTemplate === 'reference' ? '' : `<p class="legend-caption">Map features</p>`) + features.map(k => `<div class="key context-key">${k.kind === 'point' ? symbolSVG(k, 20) : `<i class="swatch ${k.kind}${k.casing ? ' cased' : ''}" style="--swatch:${k.color || k.fill || k.stroke}${k.casing ? `;--casing:${k.casing.stroke}` : ''}"></i>`}${esc(k.label)}</div>`).join('') : '') +
    (current.mapTemplate === 'reference' ? '' : observationMap ? `<p class="hint">${current.spatialData?'Observation details and coordinates are in the table below.':current.mapTemplate==='extrusion'?'Height is shown in Globe view.':'Select a circle for economy details.'}</p>` : `<p class="hint">Select a class to highlight its countries.<br>Hover to explore · Click to keep details open.</p>`);
  for (const b of $('legend-body').querySelectorAll('[data-cls]'))
    b.onclick = () => { filter = filter === b.dataset.cls ? null : b.dataset.cls; applyFilter(); };
}
function applyFilter() {
  if (!ready) return;
  view.setDim(f => filter !== null && !state.get(f.id).outside && state.get(f.id).cls !== filter);
  dash.setFilter(filter);
  for (const b of $('legend-body').querySelectorAll('[data-cls]')) {
    b.classList.toggle('active', b.dataset.cls === filter);
    b.setAttribute('aria-pressed', String(b.dataset.cls === filter));
  }
}

// ---------------------------------------------------------------------------
// Country card: follows the pointer on hover, stays put when pinned. point is in
// map pixels; null docks it top-right (search results).
function showCard(f, point, pin = false) {
  $('card').setAttribute('aria-label',namePlain(f.properties));
  const s = stateOf(f), p = f.properties;
  const parent = s.inheritedFrom && featureByIso(s.inheritedFrom);
  const note = s.inheritedFrom
    ? `<p class="card-note">No separate data; shown with ${esc(parent ? namePlain(parent.properties) : s.inheritedFrom)}'s value.</p>`
    : f === taiwan ? `<p class="card-note">${esc(taiwanNote(code => fmt(code === TAIWAN.code ? s.value : valueOfRow(currentTable().get(code)).value, current)))}</p>` : '';
  $('card').innerHTML =
    `<article class="country-card" style="--category:${s.color}">
      ${pin ? '<button class="card-close" type="button" aria-label="Close">×</button>' : ''}
      <div class="card-heading"><div class="card-kicker">${esc(current.title)}</div><h2>${nameHTML(p)}</h2></div>
      <div class="card-body">
        <div class="card-metric"><span>${esc(current.legendTitle)}</span><strong>${fmt(s.value, current)}</strong></div>
        ${s.value != null && s.year ? `<div class="card-metric"><span>Year</span><strong>${esc(s.year)}</strong></div>` : ''}
        ${note}
      </div>
      <div class="card-foot">${pin ? 'Selected · Esc to dismiss' : 'Click country to keep details open'}</div>
    </article>`;
  $('card').querySelector('.card-close')?.addEventListener('click', clearSelection);
  placeCard(point);
}
function showPlainCard(html, point) { $('card').setAttribute('aria-label','Map details'); $('card').innerHTML = `<p class="popup-plain">${html}</p>`; placeCard(point); }
function placeCard(point) {
  const card = $('card'), box = $('map').getBoundingClientRect();
  card.hidden = false;
  // The part of the map on screen: with a dashboard below, the map can reach past the bottom of a short (landscape) screen.
  const w = card.offsetWidth, h = card.offsetHeight, bottom = Math.min(box.height, innerHeight - box.top);
  let x, y;
  if (!point) { x = box.width - w - 64; y = 16; }
  else {
    x = point[0] + 16; y = point[1] + 16;
    if (x + w > box.width - 8) x = point[0] - w - 16;
    if (y + h > bottom - 8) y = point[1] - h - 16;
  }
  card.style.transform = `translate(${Math.max(8, Math.min(x, box.width - w - 8))}px, ${Math.max(8, Math.min(y, bottom - h - 8))}px)`;
}
function hideCard() { $('card').hidden = true; $('card').innerHTML = ''; }
function updateOutline() { view.setOutline([...new Set([hovered, selected].filter(Boolean).map(mapFeature))]); }

function select(f, point) {
  observationPinned=false;observationTarget=null;
  selected = f; hovered = null; cardPoint = point;
  updateOutline(); showCard(f, point, true);
  dash.highlight(f === taiwan ? null : f.properties.ISO_A3);
}
function clearSelection() {
  observationPinned=false;observationTarget=null;
  selected = null; hovered = null; cardPoint = null;
  if (ready) { updateOutline(); dash.highlight(null); }
  hideCard(); $('country').value = ''; $('country-clear').hidden = true;
}
// The feature whose card a point shows: Taiwan, China inside China's polygon.
const cardFeature = (feature, lngLat) => feature === china && lngLat && onTaiwan(taiwan, lngLat) ? taiwan : feature;
const handlers = {
  onObservation(row, info, pin=false) {
    if(restoringObservationFocus || selected && !pin && row)return;
    if(!row){if(!observationPinned && !selected)hideCard();return;}
    if(observationPinned && !pin)return;
    if(row.iso){const f=featureByIso(row.iso);if(f){if(pin)select(f,info?.point);else showCard(f,info?.point,false);}return;}
    if(pin && selected)clearSelection();
    observationPinned=pin;observationTarget=info?.target || null;
    const coords=current.spatialData?.kind==='flows'?`Origin: ${row.source.join(', ')} · Destination: ${row.target.join(', ')}`:Array.isArray(row.coordinates?.[0])?'Ordered route vertices':'Longitude, latitude: '+row.coordinates.join(', ');
    showPlainCard(`<strong>${esc(row.label || 'Observation')}</strong><br>${esc(coords)}${row.value!=null?`<br>${esc(current.spatialData?.valueLabel || current.spatialData?.valueColumn || 'Value')}: ${esc(String(row.value))}${current.spatialData?.unit?' '+esc(current.spatialData.unit):''}`:''}${row.time?`<br>Year: ${esc(row.time)}`:''}${pin?'<br><button type="button" class="observation-close">Close observation</button>':''}`,info?.point);
    $('card').setAttribute('aria-label','Spatial observation details');
    $('card').querySelector('.observation-close')?.addEventListener('click',()=>{const target=observationTarget;observationPinned=false;observationTarget=null;hideCard();restoringObservationFocus=true;try{target?.focus?.({preventScroll:true});}finally{restoringObservationFocus=false;}});
  },
  onError: reportError,
  onHover({kind, feature, lngLat, point}) {
    if (selected || observationPinned) return;
    if (kind === 'ndlsa') {   // disputed areas: no data card; only Western Sahara is labeled
      hovered = null; updateOutline();
      return ndlsaName(feature) === 'Western Sahara' ? showPlainCard('<i>Western Sahara</i>', point) : hideCard();
    }
    const f = cardFeature(feature, lngLat);
    if (stateOf(f).outside) { hovered = null; updateOutline(); return showPlainCard(`${nameHTML(f.properties)}<br>Outside the area of this map`, point); }
    if (current.mapTemplate === 'raster' && lngLat) {   // the cell under the pointer
      const g = current.rasterGrid, i = cellAt(g, lngLat), v = i == null ? null : g.values[i];
      const text = current.rasterInfo.kind === 'categorical' ? current.rasterInfo.categories.find(c => c.value === v)?.label || 'No data'
        : formatNumber(Number.isFinite(v) ? v : null, {decimals: current.decimals}) + (Number.isFinite(v) && current.rasterInfo.unit ? ' ' + current.rasterInfo.unit : '');
      hovered = f; updateOutline();
      return showPlainCard(`${nameHTML(f.properties)}<br>${esc(current.legendTitle)}: ${esc(text)}`, point);
    }
    if (f !== hovered) { hovered = f; updateOutline(); showCard(f, point); }
    else placeCard(point);
  },
  onLeave() { if(observationPinned)return; if (!selected) { hovered = null; updateOutline(); hideCard(); } },
  onClick(hit) {
    if (!hit || hit.kind === 'ndlsa' || stateOf(cardFeature(hit.feature, hit.lngLat)).outside) return clearSelection();
    select(cardFeature(hit.feature, hit.lngLat), hit.point);
  }
};

// ---------------------------------------------------------------------------
// Country search: type-ahead list with official names (italics kept), ISO code,
// current value and color. Arrow keys + Enter, Esc closes, click selects.
let searchIndex = [], matches = [], active = -1;
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function buildSearchIndex() {
  for (const f of shown) {
    const p = f.properties;
    const dataName = table.get(p.ISO_A3)?.name;
    searchIndex.push({f, name: namePlain(p), keys: [namePlain(p), p.NAM_0, dataName].filter(Boolean).map(fold), codes: [p.ISO_A3, p.WB_A3].map(fold)});
  }
  if (china && insideIds.has(china.id)) searchIndex.push({f: taiwan, name: TAIWAN.name, keys: [TAIWAN.name, table.get(TAIWAN.code)?.name].filter(Boolean).map(fold), codes: [fold(TAIWAN.code)]});
  searchIndex.sort((a, b) => a.name.localeCompare(b.name));
}
function findMatches(text) {
  const q = fold(text.trim());
  if (!q) return searchIndex;
  const rank = e => e.codes.includes(q) ? 0 : e.keys.some(k => k.startsWith(q)) ? 1
    : e.keys.some(k => k.split(/[\s(,.-]+/).some(w => w.startsWith(q))) ? 2 : e.keys.some(k => k.includes(q)) ? 3 : 9;
  return searchIndex.map(e => [rank(e), e]).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0]).map(([, e]) => e);
}
function showList() {
  if (!ready) return;
  const input = $('country'), list = $('country-list');
  matches = findMatches(input.value); active = matches.length && input.value.trim() ? 0 : -1;
  $('country-clear').hidden = !input.value;
  list.innerHTML = matches.length
    ? matches.map((e, i) => { const s = stateOf(e.f);
        return `<li id="opt-${i}" role="option" aria-selected="${i === active}" data-i="${i}">
          <i class="swatch" style="background:${s.color}"></i><span class="opt-name">${nameHTML(e.f.properties)}</span>
          <span class="opt-meta"><b>${fmt(s.value, current)}</b>${esc(e.f.properties.ISO_A3)}</span></li>`; }).join('')
    : '<li class="opt-empty" role="option" aria-disabled="true">No match. Try a name or ISO code</li>';
  list.hidden = false; input.setAttribute('aria-expanded', 'true');
  setActive(active);
}
function hideList() { $('country-list').hidden = true; $('country').setAttribute('aria-expanded', 'false'); $('country').removeAttribute('aria-activedescendant'); }
function setActive(i) {
  active = i;
  for (const li of $('country-list').querySelectorAll('[data-i]')) li.setAttribute('aria-selected', String(+li.dataset.i === i));
  const li = $('opt-' + i);
  if (li) { $('country').setAttribute('aria-activedescendant', li.id); li.scrollIntoView({block: 'nearest'}); }
}
function choose(e) {
  if (!e || !ready) return;
  $('country').value = e.name; $('country-clear').hidden = false; hideList();
  view.zoomTo(e.f);
  select(e.f, null);
}
$('country').addEventListener('focus', showList);
$('country').addEventListener('input', showList);
$('country').addEventListener('blur', () => setTimeout(hideList, 150));
$('country').addEventListener('keydown', e => {
  const open = !$('country-list').hidden;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) showList(); else setActive(Math.min(matches.length - 1, active + 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
  else if (e.key === 'Enter') { e.preventDefault(); choose(matches[Math.max(0, active)]); }
  else if (e.key === 'Escape' && open) { e.stopPropagation(); hideList(); }
});
$('country-list').addEventListener('mousedown', e => {
  const li = e.target.closest('[data-i]');
  if (li) { e.preventDefault(); choose(matches[+li.dataset.i]); }
});
$('country-clear').onclick = () => { clearSelection(); $('country').focus(); };

// ---------------------------------------------------------------------------
// View: Flat (d3, Equal Earth) or Globe (MapLibre, loaded on first use). Switching
// always returns to the coverage (the world by default). Basemap and Topography exist on the globe only.
let switching = false;
async function setView(toGlobe) {
  if (!ready || switching || toGlobe === (view.kind === 'globe')) return;
  switching = true;
  clearSelection();
  try {
    if (toGlobe && !globe) {
      status('Loading globe…');
      $('globe').hidden = false;
      globe = await import('./wb-globe.js').then(m => m.createGlobe($('globe'), {countries: geometry.countries.features, ndlsa: geometry.ndlsa.features, coverage,
        adminLevel: Math.max(CONFIG.adminLevel || 0, CONFIG.adminLines || 0), context: context.layers, ...handlers}));
      status('');
    }
    view.show(false);
    view = toGlobe ? globe : flat;
    view.show(true);
    view.home(false);
    paint(view); applyFilter(); updateOutline();
    if (view.kind === 'globe') applyBasemap();
    toggleNames();
  } catch (err) {
    $('globe').hidden = true; flat.show(true); view = flat;
    notify('The globe is unavailable: ' + err.message, 6000); console.error(err);
  } finally { switching = false; updateViewTools(); }
}
function updateViewTools() {
  const isGlobe = view?.kind === 'globe';
  $('view-flat').setAttribute('aria-pressed', String(!isGlobe));
  $('view-globe').setAttribute('aria-pressed', String(isGlobe));
  for (const id of ['basemap', 'topo']) { $(id).disabled = !isGlobe; $(id).closest('.tool').title = isGlobe ? '' : 'Globe view only'; }
}
async function applyBasemap() {
  if (view.kind !== 'globe') return;
  const topo = $('topo').checked, key = topo ? 'topographic' : ($('basemap').value === 'none' ? null : $('basemap').value);
  try { await view.setBasemap(key, topo ? CONFIG.globe.topoFillOpacity : 1); }
  catch (err) { notify('Basemap unavailable. Showing the map without it.'); console.error(err); }
}
function toggleNames() {
  view.setNames($('labels').checked).catch(err => {
    $('labels').checked = false; notify('Country names unavailable. Try again.'); console.error(err);
  });
}
function initViewTools() {
  $('basemap').value = CONFIG.globe.basemap;
  $('topo').checked = CONFIG.globe.topography;
  $('labels').checked = CONFIG.countryNames || params.get('names') === '1';
}
$('basemap').onchange = applyBasemap;
$('topo').onchange = applyBasemap;
$('labels').onchange = () => { if (ready) toggleNames(); };
$('view-flat').onclick = () => setView(false);
$('view-globe').onclick = () => setView(true);
$('zoom-in').onclick = () => ready && view.zoomBy(2);
$('zoom-out').onclick = () => ready && view.zoomBy(0.5);
$('zoom-home').onclick = () => ready && view.home();
$('zoom-full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.querySelector('main').requestFullscreen?.();

// ---------------------------------------------------------------------------
// Time slider: shown only for timeseries maps, drives the selected year.
function updateTimeUI() {
  const panel = $('time-panel'), years = yearsOf(current), isSeries = years.length > 0;
  panel.hidden = !isSeries;
  if (!isSeries) return;
  const slider = $('time-slider');
  slider.min = years[0]; slider.max = years.at(-1); slider.value = year;
  $('time-year').textContent = year;
}
function stopPlaying() {
  clearInterval(playTimer); playTimer = null;
  $('time-play').textContent = '▶'; $('time-play').setAttribute('aria-label', 'Play');
}
function togglePlay() {
  if (playTimer) return stopPlaying();
  $('time-play').textContent = '⏸'; $('time-play').setAttribute('aria-label', 'Pause');
  playTimer = setInterval(() => {
    const years = yearsOf(current), i = years.indexOf(year);
    year = years[(i + 1) % years.length];
    updateTimeUI(); render();
  }, current.playInterval || 600);
}
$('time-slider').addEventListener('input', () => { stopPlaying(); const years = yearsOf(current); year = years.reduce((best, y) => Math.abs(y - +$('time-slider').value) < Math.abs(best - +$('time-slider').value) ? y : best, years[0]); updateTimeUI(); render(); });
$('time-play').onclick = togglePlay;

// ---------------------------------------------------------------------------
// Dashboard below the map: the current tab's elements, fed with the rows the map already joined and classified.
// One row per economy on the map (as in the CSV). Taiwan, China is inside China's polygon, so it has no row of its
// own; values inherited from another economy (French overseas departments) are marked and left out of the charts.
function dashRows() {
  const rows = [], explorer = (current.dashboard || []).some(item => item.type === 'explorer');   // only the explorer uses centroids
  for (const f of shown) {
    const p = f.properties;
    const s = state.get(f.id), parent = s.inheritedFrom && featureByIso(s.inheritedFrom);
    const ownRow = lookupRow(p, currentTable()).row;
    rows.push({coordinates: explorer ? centroidOf(f) : null, values: ownRow?.values || {}, iso: p.ISO_A3, name: namePlain(p), italic: nameHTML(p).startsWith('<i>'), value: s.value, year: s.year, cls: s.cls, color: s.color,
      inherited: !!s.inheritedFrom, inheritedName: parent ? namePlain(parent.properties) : s.inheritedFrom});
  }
  return rows;
}
// Time series for the line chart: the median of the economies on the map per year, and one economy's own values.
function seriesOf(m) {
  if (m.type !== 'timeseries') return null;
  if (m.series) return m.series;
  const ownRow = iso => { const f = featureByIso(iso); const {row, inheritedFrom} = f ? lookupRow(f.properties, m.table) : {}; return inheritedFrom ? null : row; };
  const rows = shown.map(f => ownRow(f.properties.ISO_A3)).filter(Boolean);
  const med = v => { v = v.filter(x => x != null).sort((a, b) => a - b); const n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null; };
  return m.series = {years: m.years, count: rows.length,
    median: m.years.map(y => ({year: y, value: med(rows.map(r => r.years[y]))})),
    of: iso => { const r = ownRow(iso); return m.years.map(y => ({year: y, value: r?.years[y] ?? null})); }};
}
function dashContext() {
  return {countries: geometry.countries.features, coverage, noun: NOUN(), isInside: f => insideIds.has(f.id), map: current, items: current.dashboard || [], rows: dashRows(), classes: [...classLabels(countryClasses(current)), {cls:'na',color:COLORS.noData,label:NO_DATA_LABEL}], fmt: v => fmt(v, current),
    year, yearLabel: current.spatialData ? 'Country indicator · observation layer shown separately' : yearLabel(), series: seriesOf(current), filter,
    selected: selected && selected !== taiwan ? selected.properties.ISO_A3 : null};
}
// Spatial observations have their own accessible data table. Country dashboards continue
// to describe the country indicator and never silently mix those rows with observations.
function spatialCells(row) {
  const coordinates = row.source ? [...row.source, ...row.target] : row.coordinates;
  return [row.label || `Observation ${row.rowNumber}`, ...coordinates, row.value, row.time, ...(current.spatialData.kind === 'routes' ? [row.group, row.order] : [])];
}
function spatialHeaders() {
  return ['Observation', ...(current.spatialData.kind === 'flows' ? ['Source longitude', 'Source latitude', 'Target longitude', 'Target latitude'] : ['Longitude', 'Latitude']), 'Value', 'Year', ...(current.spatialData.kind === 'routes' ? ['Route', 'Vertex order'] : [])];
}
// A CSV cell; text a spreadsheet would run as a formula (=, +, -, @) gets a leading apostrophe.
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s) && isNaN(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function spatialCSV() {
  return '\ufeff' + [spatialHeaders(), ...thematicData().rows.map(spatialCells)].map(r => r.map(csvCell).join(',')).join('\r\n');
}
function renderSpatialTable() {
  let section = $('spatial-observations');
  if (!section) {
    section = document.createElement('div'); section.id = 'spatial-observations'; section.className = 'dash-card dash-table';
    section.style.margin = '0 var(--sp-m) var(--sp-m)'; $('dashboard').after(section);
  }
  section.hidden = !current.spatialParsed;
  if (!current.spatialParsed) return;
  const wasOpen = section.querySelector('details')?.open || false, rows = thematicData().rows;
  section.innerHTML = `<details${wasOpen ? ' open' : ''}><summary class="dash-more">Spatial observations · ${rows.length} rows</summary><p class="dash-sub">${esc(TEMPLATE_NAMES[current.mapTemplate])} · ${esc(CONFIG.source)}. Coordinates and values are reported as supplied. Missing sizing values have no symbol; zero remains zero.</p><div class="dash-scroll" role="region" aria-label="Spatial observations data" tabindex="0" style="overflow:auto"></div></details>`;
  const details = section.querySelector('details');let pageIndex=0;const pageSize=100;
  const draw = () => {
    if (!details.open) return;
    const head = spatialHeaders();
    section.querySelector('.dash-scroll').innerHTML = `<table><caption>Observations shown for ${esc(yearLabel() || 'the current map')}</caption><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(pageIndex*pageSize,(pageIndex+1)*pageSize).map(row => `<tr>${spatialCells(row).map((v, i) => i === 0 ? `<th scope="row">${esc(v)}</th>` : `<td>${v == null ? 'No data' : esc(String(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  const paging=document.createElement('div');paging.className='spatial-paging';details.append(paging);
  function pageControls(){paging.innerHTML=`<p class="dash-note">${rows.length?`Rows ${pageIndex*pageSize+1}–${Math.min(rows.length,(pageIndex+1)*pageSize)} of ${rows.length}`:'No observations in this year'}. CSV download includes every observation shown for this year.</p>${rows.length>pageSize?`<div class="row"><button type="button" data-page="previous"${pageIndex===0?' disabled':''}>Previous rows</button><button type="button" data-page="next"${(pageIndex+1)*pageSize>=rows.length?' disabled':''}>Next rows</button></div>`:''}`;}
  paging.onclick=e=>{const b=e.target.closest('[data-page]');if(!b)return;const direction=b.dataset.page;pageIndex+=direction==='next'?1:-1;draw();pageControls();paging.querySelector(`[data-page="${direction}"]`)?.focus({preventScroll:true});};
  details.addEventListener('toggle',()=>{draw();pageControls();});draw();pageControls();
}

function renderDashboard() {
  const items = current.dashboard || [];
  document.body.classList.toggle('has-dashboard', items.length > 0 || !!current.spatialParsed);
  dash.render(dashContext());
}
const dashHandlers = {
  hover(iso) {
    if (!ready || selected) return;
    const f = iso && featureByIso(iso);
    if ((f || null) !== hovered) { hovered = f || null; updateOutline(); }
  },
  select(iso) { const f = featureByIso(iso); if (f && ready) { view.zoomTo(f); select(f, null); } },
  filter(cls) { filter = filter === cls ? null : cls; applyFilter(); },
  year(y) { if (current.type === 'timeseries') { stopPlaying(); year = y; render(); } },
  export(i, kind) { if (kind === 'csv') exportCSV(); else exportChart(i, kind); }
};
const chartName = item => RANKED.includes(item.type) ? `${item.type}-${item.order}` : item.type;
function chartFigureOf(i) {
  const item = dash.item(i), ctx = dashContext();
  return chartFigure(item, ctx, {title: `${current.title}: ${dashTitle(item)}`,
    subtitle: [['pie', 'donut'].includes(item.type) ? 'Economy counts by legend class · includes no data' : null, current.legendTitle, ['line', 'area'].includes(item.type) ? `${current.years[0]}–${current.years.at(-1)}` : yearLabel()].filter(Boolean).join(' · '),
    source: sourceLine(), stamp: stampText(CONFIG)});
}
async function exportChart(i, kind) {
  status('Preparing chart…');
  try {
    const fig = await chartFigureOf(i), name = exportName(kind, chartName(dash.item(i)));
    if (kind === 'svg') download(new Blob([fig.svg], {type: 'image/svg+xml'}), name);
    else download(await figurePNG(fig), name);
    status('');
  } catch (err) { notify('Export failed: ' + err.message, 6000); console.error(err); }
}

// ---------------------------------------------------------------------------
// Exports: always the map's coverage (the full world in Equal Earth by default), thematic layers only (no basemap
// or names), with title, legend, source, stamp, disclaimer and logo. Same drawing as the flat view.
// layout: 'screen' (1600 px) or the print frame from map.json (print.orientation: 6.5 × 4.5 or 6.5 × 9 in).
function figure(layout = 'screen') {
  const m = current;
  return buildFigureSVG({countries: geometry.countries.features, ndlsa: geometry.ndlsa.features, coverage, adminLevel: CONFIG.adminLevel,
    countryColor: countryFill, ndlsaColor: ndlsaFill, thematic: thematicData(),
    title: m.type === 'timeseries' ? `${m.title} (${year})` : m.title, subtitle: [mapLegendTitle(m), yearLabel(), m.mapTemplate === 'extrusion' ? 'Flat choropleth counterpart · heights are available in Globe' : m.mapTemplate === 'proportional-symbol' ? 'Circle area proportional to value' : null].filter(Boolean).join(' · '),
    legendTitle: mapLegendTitle(m), legend: [...legendItems(m), ...featureLegend().map(k => ({...k, color: k.color || k.fill || k.stroke}))],
    context: context.layers, terrain, adminLines: CONFIG.adminLines || 0, source: sourceLine(), stamp: stampText(CONFIG)}, layout);
}
const exportName = (kind, what = 'map') => `${stampFileName(CONFIG)}-${current.id}${what === 'map' ? '' : '-' + what}.${kind}`;
// kind: png | svg (screen size), print-png (print frame at print.dpi), pdf (print frame through the print dialog).
async function exportFigure(kind) {
  if (!ready) return;
  const btn = $(`export-${kind}`), print = kind === 'print-png' || kind === 'pdf';
  btn.disabled = true; status(coverage.kind === 'world' ? 'Preparing full-world Equal Earth map…' : `Preparing the map of ${coverage.label}…`);
  try {
    const fig = await figure(print ? CONFIG.print.orientation : 'screen');
    if (kind === 'pdf') await printFigure(fig);
    else if (kind === 'svg') download(new Blob([fig.svg], {type: 'image/svg+xml'}), exportName('svg'));
    else download(await figurePNG(fig, print ? CONFIG.print.dpi / 100 : undefined), print ? exportName('png', `print-${CONFIG.print.dpi}dpi`) : exportName('png'));
    status('');
  } catch (err) { notify('Export failed: ' + err.message, 6000); console.error(err); }
  finally { btn.disabled = false; }
}
function csvText() {
  const lines = [[CONFIG.adminLevel ? `adm${CONFIG.adminLevel}_code` : 'iso3', 'name', 'year', current.column || `${current.id}_${year}`, 'shown_with_value_of'].join(',')];
  for (const f of shown) {
    const s = state.get(f.id);
    lines.push([f.properties.ISO_A3, namePlain(f.properties), s.value == null ? '' : s.year, s.value ?? '', s.inheritedFrom || ''].map(csvCell).join(','));
  }
  // Taiwan, China: its own value, but the map shows China's.
  if (china && insideIds.has(china.id)) lines.push([TAIWAN.code, TAIWAN.name, taiwanState.value == null ? '' : taiwanState.year, taiwanState.value ?? '', TAIWAN.parent].map(csvCell).join(','));
  return '﻿' + lines.join('\r\n');
}
function exportCSV() {
  if (ready) download(new Blob([current.spatialParsed ? spatialCSV() : csvText()], {type: 'text/csv;charset=utf-8'}), exportName('csv', 'data'));
}
function yearLabel() {
  if (current.spatialData?.timeColumn) return year==null?'Observation year not supplied':String(year);
  const years = [...state.values()].filter(s => s.value != null && s.year).map(s => +s.year);
  if (!years.length) return '';
  const lo = Math.min(...years), hi = Math.max(...years);
  return lo === hi ? String(hi) : `Latest available, ${lo}–${hi}`;
}

// ---------------------------------------------------------------------------
document.addEventListener('click', e => {   // close the Export menu on outside click or after a choice
  const menu = document.querySelector('.export');
  if (menu.open && (!menu.contains(e.target) || e.target.closest('button'))) menu.open = false;
});
$('legend-toggle').onclick = () => {
  const hidden = $('legend-body').hidden = !$('legend-body').hidden;
  $('legend-toggle').setAttribute('aria-expanded', String(!hidden));
  $('legend-toggle').lastElementChild.textContent = hidden ? '+' : '−';
};
if (matchMedia('(max-width: 700px), (max-height: 500px)').matches) $('legend-toggle').click();   // phones and short screens: legend starts collapsed
// On short screens the legend gets the height left below the panels (and scrolls), never sliding under them.
new ResizeObserver(([e]) => document.querySelector('main').style.setProperty('--panels-h', e.contentRect.height + 'px'))
  .observe(document.querySelector('.map-panels'));
$('export-png').onclick = () => exportFigure('png');
$('export-svg').onclick = () => exportFigure('svg');
$('export-print-png').onclick = () => exportFigure('print-png');
$('export-pdf').onclick = () => exportFigure('pdf');
$('export-csv').onclick = exportCSV;
addEventListener('hashchange', () => { if (ready) { stopPlaying(); render(); } });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelector('.export').open = false;
  if (ready) clearSelection();
});

// Read-only hooks for tools/check.py (the automated AGENTS.md checklist). Keep them.
window.WBMAP = {
  get ready() { return ready; },
  get view() { return view?.kind; },
  get unmatched() { return currentTable()?.unknown || []; },
  get maps() { return CONFIG.maps.map(m => m.id); },
  get stamp() { return stampText(CONFIG); },
  logo: LOGO,
  exportName: kind => exportName(kind),
  colorOf: iso => featureByIso(iso) && countryFill(featureByIso(iso)),
  ndlsaColorsOf: name => geometry.ndlsa.features.filter(f => ndlsaName(f) === name).map(ndlsaFill),
  ndlsaNames: () => [...new Set(geometry.ndlsa.features.map(ndlsaName))],
  joins: () => geometry.countries.features.map(f => ({iso: f.properties.ISO_A3, wb: f.properties.WB_A3, ...state.get(f.id), color: countryFill(f)})),
  coverage: () => ({kind: coverage.kind, label: coverage.label, projection: coverage.projection, inside: shown.map(f => f.properties.ISO_A3), outsideRows: outsideCodes(), adminLevel: CONFIG.adminLevel || 0}),
  admin: () => CONFIG.adminLevel ? {level: CONFIG.adminLevel, units: shown.length, unknown: table.unknown.map(c => ({code: c, level: adminDictionary.get(c)?.level ?? null})),
    disputedUnits: shown.filter(f => f.properties.disputed).map(f => f.properties.ISO_A3)} : null,
  outside: COLORS.outside,
  context: () => ({layers: Object.fromEntries(Object.entries(context.layers).map(([k, v]) => [k, v.length])), attribution: context.attribution, legend: featureLegend().map(k => k.label),
    terrain: terrain && {cells: terrain.grid.width * terrain.grid.height, interval: terrain.grid.interval, hillshade: terrain.hillshade, contours: terrain.contours, tints: terrain.tints}}),
  source: () => sourceLine(),
  flatTransform: () => flat.transform(),
  flatContext: () => flat.contextInfo(),
  get adminLines() { return CONFIG?.adminLines || 0; },
  home: () => view.home(false),
  rows: () => [...currentTable().values()].map(r => ({code: r.code, value: valueOfRow(r).value})),
  noData: COLORS.noData, westernSahara: COLORS.westernSahara, disclaimer: DISCLAIMER,
  borders: () => flat.bordersInfo(),
  names: () => flat.namesShown(),
  setView, figure, csv: () => current.spatialParsed ? spatialCSV() : csvText(),
  mapTemplate: () => ({kind: current.mapTemplate || 'choropleth', raster: current.rasterInfo ? {kind: current.rasterInfo.kind, cells: current.rasterGrid.width * current.rasterGrid.height} : null, points: thematicData().points.length, lines: thematicData().lines.length, observations: thematicData().rows.length, colors:[...current.colors], legendLabels:legendItems(current).map(k=>k.label), spatial:!!current.spatialData, missing: thematicData().missing}),
  legendClasses: () => legendItems(current).map(k=>({...k,count:current.spatialParsed ? current.mapTemplate==='heatmap'?null:current.mapTemplate==='route'?thematicData().lines.length:k.cls==='observation'?thematicData().rows.length:thematicData().rows.filter(r=>classify(r.value,current).cls===k.cls).length : dashRows().filter(r=>!r.inherited && r.cls===k.cls).length})),
  dashboard: () => dash.info(),
  get dashboardItems() { return (current.dashboard || []).length; },
  chartFigure: chartFigureOf,
  chartName: i => exportName('png', chartName(dash.item(i))),
  png: async () => (await figurePNG(await figure())).size,
  get print() { return CONFIG.print; },
  printFigure: () => figure(CONFIG.print.orientation),
  printPNG: async () => { const fig = await figure(CONFIG.print.orientation), png = await figurePNG(fig, CONFIG.print.dpi / 100);
    const bmp = await createImageBitmap(png); return {width: bmp.width, height: bmp.height, size: png.size}; }
};

start().catch(err => { status('Unable to load the map. ' + err.message); console.error(err); });
