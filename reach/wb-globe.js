// wb-globe.js — the globe view: MapLibre GL 5.16.0, loaded only when the user
// first switches to Globe. DO NOT EDIT PER PROJECT.
// Layer order, bottom to top: basemap → data fills → hover outline → WB borders → names.

import {COLORS, BOUNDARY_SERVICE, BOUNDARY_CATEGORIES, BORDER_WIDTH, RANK_BANDS, ADMIN_LINES, loadCountryNames} from './wb-carto.js';
import {splitAntimeridian} from './wb-map-templates.js';
import {contextOrder, styleOf, isArea, isPoints} from './wb-context.js';

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl';
const GLYPHS = 'https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/resources/fonts/{fontstack}/{range}.pbf';

let libraryPromise;
function loadMapLibre() {
  return libraryPromise ||= new Promise((resolve, reject) => {
    if (window.maplibregl) return resolve();
    const css = Object.assign(document.createElement('link'), {rel: 'stylesheet', href: `${MAPLIBRE}.css`});
    const js = Object.assign(document.createElement('script'), {src: `${MAPLIBRE}.js`});
    js.onload = resolve;
    js.onerror = () => { libraryPromise = null; js.remove(); reject(new Error('The globe library could not be loaded')); };
    document.head.append(css, js);
  });
}

// Basemaps: the two designated WB basemap items, item-specific styles. Only
// their land/water/terrain fills and lines are used; Esri labels and Esri
// boundary lines are dropped so borders and names stay World Bank.
// Light gray = quiet context. Topographic = optional terrain layer (made for
// non-choropleth maps; with a choropleth, fills go slightly transparent).
export const BASEMAPS = {
  lightGray: {label: 'Light gray', item: 'dcc1c1c0f97f4e458199888b0fc63896'},
  topographic: {label: 'Topographic', item: '612a40565f734bf482a3b44ca2b0e8c5'}
};
const styleCache = new Map();
function fetchStyle(url) {
  if (!styleCache.has(url)) styleCache.set(url, fetch(url).then(r => {
    if (!r.ok) throw new Error(`Style unavailable (HTTP ${r.status})`);
    return r.json();
  }).catch(e => { styleCache.delete(url); throw e; }));
  return styleCache.get(url);
}

// Same interface as createFlatMap(). Resolves once the globe is drawn.
export async function createGlobe(container, {countries, ndlsa, coverage, adminLevel = 0, context = {}, onHover, onClick, onLeave, onError, onObservation}) {
  await loadMapLibre();
  const map = new maplibregl.Map({
    container, attributionControl: false, renderWorldCopies: false, maxPitch: 0, dragRotate: false,
    style: {version: 8, glyphs: GLYPHS, projection: {type: 'globe'}, sources: {}, layers: [{id: 'background', type: 'background', paint: {'background-color': COLORS.water}}]},
    center: [15, 15], zoom: 1, minZoom: -2, maxZoom: 9
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({compact: true, customAttribution: 'World Bank · WB_GAD'}), 'bottom-right');
  map.on('error', e => onError(e.error || new Error('Part of the globe failed to load')));
  // Ready once the style is in; layers can be added before the first frame is drawn.
  await new Promise(resolve => map.isStyleLoaded() ? resolve() : map.once('style.load', resolve));

  map.addSource('countries', {type: 'geojson', data: {type: 'FeatureCollection', features: countries}});
  map.addSource('ndlsa', {type: 'geojson', data: {type: 'FeatureCollection', features: ndlsa}});
  const stateColor = ['coalesce', ['feature-state', 'color'], COLORS.noData];
  const dimmable = base => ['case', ['boolean', ['feature-state', 'dim'], false], 0.18, base];
  map.addLayer({id: 'country-fill', type: 'fill', source: 'countries', paint: {'fill-color': stateColor, 'fill-antialias': false, 'fill-opacity': dimmable(1)}});
  map.addLayer({id: 'ndlsa-fill', type: 'fill', source: 'ndlsa', paint: {'fill-color': stateColor, 'fill-antialias': false}});
  // Context layers (data/context/) above the fills, styled by class like the flat view; towns go on top, below.
  const byClass = (name, key, otherwise) => ['match', ['to-string', ['get', 'class']], ...Object.entries(styleOf(name)).flatMap(([k, s]) => [k, (typeof key === 'function' ? key(s) : s[key]) ?? otherwise]), otherwise];
  for (const name of contextOrder(context).filter(n => !isPoints(n))) {   // point symbols: flat view and exports only, for now
    map.addSource(`context-${name}`, {type: 'geojson', data: {type: 'FeatureCollection', features: context[name]}});
    const dash = Object.values(styleOf(name)).find(s => s.dash)?.dash;   // one dash per layer (MapLibre can't vary it by class)
    if (isArea(name)) { map.addLayer({id: `context-${name}`, type: 'fill', source: `context-${name}`, paint: {'fill-color': byClass(name, 'fill', '#cfe2f0')}}); continue; }
    if (name === 'towns') continue;
    if (Object.values(styleOf(name)).some(s => s.casing)) map.addLayer({id: `context-${name}-casing`, type: 'line', source: `context-${name}`, layout: {'line-cap': 'round', 'line-join': 'round'},   // cased lines (roads): casing under the fill
      paint: {'line-color': byClass(name, s => s.casing?.stroke ?? s.stroke, '#999999'), 'line-width': byClass(name, s => s.width + 2 * (s.casing?.width ?? 0), 0.5)}});
    map.addLayer({id: `context-${name}`, type: 'line', source: `context-${name}`, layout: {'line-cap': 'round', 'line-join': 'round'},
      paint: {'line-color': byClass(name, 'stroke', '#999999'), 'line-width': byClass(name, 'width', 0.5), ...(dash ? {'line-dasharray': dash} : {})}});
  }
  const empty = {type: 'FeatureCollection', features: []};
  map.addSource('observations', {type: 'geojson', data: empty});
  map.addSource('connections', {type: 'geojson', data: empty});
  map.addLayer({id: 'observation-density', type: 'heatmap', source: 'observations', layout: {visibility: 'none'},
    paint: {'heatmap-radius': 24, 'heatmap-weight': 1, 'heatmap-opacity': .7}});
  map.addLayer({id: 'observation-points', type: 'circle', source: 'observations', layout: {visibility: 'none'},
    paint: {'circle-color': ['get', 'color'], 'circle-radius': ['get', 'radius'], 'circle-opacity': .8, 'circle-stroke-color': COLORS.text, 'circle-stroke-width': .6}});
  map.addLayer({id: 'observation-lines', type: 'line', source: 'connections', layout: {visibility: 'none', 'line-cap': 'round', 'line-join': 'round'},
    paint: {'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': .8}});
  map.addLayer({id: 'country-elevation', type: 'fill-extrusion', source: 'countries', layout: {visibility: 'none'},
    paint: {'fill-extrusion-color': stateColor, 'fill-extrusion-height': ['coalesce', ['feature-state', 'height'], 0], 'fill-extrusion-opacity': 1}});
  map.addLayer({id: 'country-outline', type: 'line', source: 'countries',
    paint: {'line-color': COLORS.text, 'line-width': 1.6, 'line-opacity': ['case', ['boolean', ['feature-state', 'outline'], false], 1, 0]}});
  map.addSource('wb-boundaries', {type: 'vector', tiles: [`${BOUNDARY_SERVICE}/tile/{z}/{y}/{x}.pbf`],
    minzoom: 0, maxzoom: 23, attribution: 'World Bank · WB_GAD_Boundaries'});
  for (const a of ADMIN_LINES.filter(a => a.level <= adminLevel)) map.addLayer({   // admin maps: admin lines below the borders
    id: `admin-${a.level}`, type: 'line', source: 'wb-boundaries', 'source-layer': a.layer, minzoom: a.minzoom - 1,
    layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': COLORS.border, 'line-width': a.width}
  });
  for (const c of BOUNDARY_CATEGORIES) map.addLayer({
    id: `boundary-${c.name}`, type: 'line', source: 'wb-boundaries', 'source-layer': 'ADM0_Boundaries',
    filter: ['==', ['get', '_symbol'], c.symbol], layout: {'line-cap': 'round', 'line-join': 'round'},
    paint: {'line-color': COLORS.border, 'line-width': BORDER_WIDTH, ...(c.dash ? {'line-dasharray': c.dash} : {})}
  });

  if (context.towns) {
    map.addLayer({id: 'context-towns', type: 'circle', source: 'context-towns', paint: {'circle-radius': byClass('towns', 'size', 2), 'circle-color': byClass('towns', 'fill', '#333333'),
      'circle-stroke-color': byClass('towns', 'stroke', '#ffffff'), 'circle-stroke-width': 1}});   // the star and inner ring are flat-view only
    map.addLayer({id: 'context-town-names', type: 'symbol', source: 'context-towns', layout: {'text-field': ['get', 'name'], 'text-font': ['literal', ['Montserrat SemiBold']],
      'text-size': byClass('towns', 'label', 12), 'text-anchor': 'left', 'text-offset': [0.6, 0], 'text-padding': 3},
      paint: {'text-color': COLORS.text, 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.3}});
  }
  let currentTemplate=null;
  const observationInfo=e=>{
    if(!currentTemplate || currentTemplate.kind==='heatmap')return null;
    const features=map.queryRenderedFeatures([[e.point.x-12,e.point.y-12],[e.point.x+12,e.point.y+12]],{layers:['observation-points','observation-lines']});
    const f=features[0];return f?(f.layer.id==='observation-points'?currentTemplate.points:currentTemplate.lines)[f.id]:null;
  };
  const info = e => {
    const f = map.queryRenderedFeatures(e.point, {layers: ['ndlsa-fill', 'country-fill']})[0];
    if (!f) return null;
    const source = f.layer.id === 'ndlsa-fill' ? ndlsa : countries;
    return {kind: f.layer.id === 'ndlsa-fill' ? 'ndlsa' : 'country', feature: source[f.id], lngLat: [e.lngLat.lng, e.lngLat.lat], point: [e.point.x, e.point.y]};
  };
  map.on('mousemove', e => {const row=observationInfo(e);if(row){map.getCanvas().style.cursor='pointer';onObservation?.(row,{point:[e.point.x,e.point.y],target:map.getCanvas()},false);return;} const h = info(e); map.getCanvas().style.cursor = h?.kind === 'country' ? 'pointer' : ''; h ? onHover(h) : onLeave(); });
  map.getCanvas().addEventListener('mouseleave', () => onLeave());
  map.on('click', e => {const row=observationInfo(e);if(row)onObservation?.(row,{point:[e.point.x,e.point.y],target:map.getCanvas()},true);else onClick(info(e));});

  let outlined = [], basemapRequest = 0;
  // Home: the whole globe, or the map's coverage (a region, countries or a box).
  const home = (duration = 900) => {
    if (!coverage || coverage.kind === 'world') return map.easeTo({center: [15, 15], zoom: Math.log2(0.8 * Math.min(container.clientWidth, container.clientHeight) * Math.PI / 512), bearing: 0, pitch: 0, duration});
    let [[w, s], [e, n]] = d3.geoBounds(coverage.extent);
    if (e < w) e += 360;   // crosses the antimeridian
    map.fitBounds([[w, s], [e, n]], {padding: Math.round(24 + coverage.padding * Math.min(container.clientWidth, container.clientHeight)), bearing: 0, pitch: 0, duration});
  };
  home(0);

  return {
    kind: 'globe',
    recolor(countryColor, ndlsaColor) {
      countries.forEach((f, id) => map.setFeatureState({source: 'countries', id}, {color: countryColor(f)}));
      ndlsa.forEach((f, id) => map.setFeatureState({source: 'ndlsa', id}, {color: ndlsaColor(f)}));
    },
    setTemplate(data, stateOf) {
      currentTemplate=data;
      map.getSource('observations').setData({type: 'FeatureCollection', features: data.points.map((row, id) => ({
        type: 'Feature', id, geometry: {type: 'Point', coordinates: row.coordinates},
        properties: {color: row.color, radius: data.kind === 'proportional-symbol' ? data.maxValue ? 24 * Math.sqrt(row.value / data.maxValue) : 0 : 5}
      }))});
      map.getSource('connections').setData({type: 'FeatureCollection', features: data.lines.map((row, id) => ({
        type: 'Feature', id, geometry: {type: 'MultiLineString', coordinates: splitAntimeridian(row.coordinates)},
        properties: {color: row.color, width: data.sized ? data.maxValue ? 8 * Math.sqrt((row.value || 0) / data.maxValue) : 0 : 2}
      }))});
      const colors = data.colors.flatMap((color, i) => [(.01 + .99 * i / Math.max(1, data.colors.length - 1)), color]);
      map.setPaintProperty('observation-density', 'heatmap-color', ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(255,255,255,0)', ...colors]);
      map.setLayoutProperty('observation-density', 'visibility', data.kind === 'heatmap' ? 'visible' : 'none');
      map.setLayoutProperty('observation-points', 'visibility', ['locator', 'proportional-symbol'].includes(data.kind) ? 'visible' : 'none');
      map.setLayoutProperty('observation-lines', 'visibility', ['flow', 'route'].includes(data.kind) ? 'visible' : 'none');
      map.setLayoutProperty('country-elevation', 'visibility', data.kind === 'extrusion' ? 'visible' : 'none');
      if (data.kind === 'extrusion') {
        const maximum = data.maxValue;
        for (const f of countries) map.setFeatureState({source: 'countries', id: f.id}, {height: maximum ? Math.max(0, stateOf(f).value || 0) / maximum * 1000000 : 0});
      }
    },
    setDim(isDim) { countries.forEach((f, id) => map.setFeatureState({source: 'countries', id}, {dim: isDim(f)})); },
    setOutline(features) {
      for (const f of outlined) map.setFeatureState({source: 'countries', id: f.id}, {outline: false});
      outlined = features.filter(f => countries[f.id] === f);
      for (const f of outlined) map.setFeatureState({source: 'countries', id: f.id}, {outline: true});
    },
    async setNames(visible) {
      if (visible && !map.getSource('wb-names')) {
        const data = await loadCountryNames();
        if (!map.getSource('wb-names')) addNameLayers(map, data);
      }
      for (const l of map.getStyle().layers) if (l.id.startsWith('names-')) map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
    },
    // key: 'lightGray' | 'topographic' | null (white). Always drawn beneath the data.
    async setBasemap(key, fillOpacity = 1) {
      map.setPaintProperty('country-fill', 'fill-opacity', dimmable(fillOpacity));
      map.setPaintProperty('ndlsa-fill', 'fill-opacity', fillOpacity);
      map.setPaintProperty('country-elevation','fill-extrusion-opacity',fillOpacity);
      const request = ++basemapRequest;
      for (const l of map.getStyle().layers) if (l.id.startsWith('bm-')) map.removeLayer(l.id);
      for (const s of Object.keys(map.getStyle().sources)) if (s.startsWith('bm-')) map.removeSource(s);
      const item = BASEMAPS[key]?.item;
      if (!item) return;
      const style = await fetchStyle(`https://www.arcgis.com/sharing/rest/content/items/${item}/resources/styles/root.json`);
      if (request !== basemapRequest) return;   // a newer choice was made while loading
      const sources = ['esri', 'hillshade'];
      const keep = l => l.layout?.visibility !== 'none' && (l.type === 'background' ||
        (['fill', 'line'].includes(l.type) && sources.includes(l.source) && !/^Boundary line/i.test(l['source-layer'] || '')));
      if (style.sprite) map.setSprite(style.sprite);
      for (const [id, src] of Object.entries(style.sources)) if (sources.includes(id))
        map.addSource(`bm-${id}`, {type: 'vector', tiles: src.tiles || [`${src.url}/tile/{z}/{y}/{x}.pbf`], attribution: 'Esri, World Bank'});
      for (const l of style.layers.filter(keep))
        map.addLayer({...l, id: `bm-${l.id}`, ...(l.source ? {source: `bm-${l.source}`} : {})}, 'country-fill');
    },
    home(animate = true) { home(animate ? 900 : 0); },
    zoomBy(factor) { map.easeTo({zoom: map.getZoom() + Math.log2(factor), duration: 250}); },
    zoomTo(feature) {
      const b = new maplibregl.LngLatBounds();
      (function visit(c) { typeof c[0] === 'number' ? b.extend(c) : c.forEach(visit); })(feature.geometry.coordinates);
      map.flyTo({center: b.getCenter(), zoom: Math.max(map.getZoom(), 2.5), duration: 1200});
    },
    project(lngLat) { const p = map.project(lngLat); return [p.x, p.y]; },
    show(on) { container.hidden = !on; if (on) map.resize(); }
  };
}

function addNameLayers(map, data) {
  map.addSource('wb-names', {type: 'geojson', data, attribution: 'World Bank · WB_GAD'});
  const justify = ['get', 'justify'];
  for (const [lo, hi, minzoom] of RANK_BANDS) map.addLayer({
    id: `names-${lo}`, type: 'symbol', source: 'wb-names', minzoom,
    filter: ['all', ['>=', ['get', 'scalerank'], lo], ['<=', ['get', 'scalerank'], hi]],
    layout: {
      visibility: 'none',
      'text-field': ['step', ['zoom'], ['get', 'ADM0_ABBR'], 4, ['get', 'ADM0_NAME']],
      'text-font': ['case', ['==', ['get', 'territory'], 'Y'], ['literal', ['Montserrat SemiBold Italic']], ['literal', ['Montserrat SemiBold']]],
      'text-size': ['interpolate', ['linear'], ['zoom'], 1, ['-', 11.5, ['*', 0.5, ['get', 'scalerank']]], 6, ['-', 15, ['*', 0.5, ['get', 'scalerank']]]],
      'text-anchor': ['match', justify, 'L', 'left', 'R', 'right', 'center'],
      'text-offset': ['match', justify, 'L', ['literal', [0.4, 0]], 'R', ['literal', [-0.4, 0]], ['literal', [0, 0]]],
      'text-max-width': 7, 'text-padding': 3, 'symbol-sort-key': ['get', 'scalerank']
    },
    paint: {'text-color': COLORS.text, 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.3}
  });
}
