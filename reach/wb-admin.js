// wb-admin.js — World Bank admin 1 and admin 2 units (standard 2.0). DO NOT EDIT PER PROJECT.
// The shapes are the frozen, reviewed refresh in data/admin/ (tools/admin_refresh.py: TopoJSON with shared borders,
// one code field per unit), decoded here without a library. They give the fills and the joins; the admin lines on the
// map come from the WB boundary tiles (ADM1_Boundaries, ADM2_Boundaries), like the international borders.
import {esc} from './wb-carto.js';

export const ADMIN_FIELDS = {1: 'ADM1CD_c', 2: 'ADM2CD_c'};
export const UNNAMED = 'Unnamed unit';   // the service has no name for some units: they keep their code

// TopoJSON → GeoJSON features (quantized, delta-encoded arcs; a negative index is an arc read backwards).
export function decodeTopology(topo, object = 'units') {
  const {scale: [kx, ky], translate: [x0, y0]} = topo.transform;
  const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => [(x += dx) * kx + x0, (y += dy) * ky + y0]); });
  const ring = refs => {
    const points = [];
    for (const r of refs) { const a = r < 0 ? arcs[~r].slice().reverse() : arcs[r]; points.push(...(points.length ? a.slice(1) : a)); }
    return points;
  };
  const polygon = rings => { const out = rings.map(ring); return out[0]?.length >= 4 ? out.filter(r => r.length >= 4) : []; };
  // A polygon wound the wrong way would fill the whole sphere: turn it round (refreshes already leave such parts out).
  const outward = p => d3.geoArea({type: 'Polygon', coordinates: p}) > 2 * Math.PI ? p.map(r => [...r].reverse()) : p;
  return topo.objects[object].geometries.map(g => {
    const coordinates = g.type === 'Polygon' ? outward(polygon(g.arcs)) : g.arcs.map(polygon).filter(p => p.length).map(outward);
    return {type: 'Feature', properties: {...g.properties}, geometry: {type: g.type, coordinates}};
  });
}

// The files a map with this coverage and level needs, in data/admin/ (tools/admin_pack.py copies them in).
export const adminFiles = (isos, level) => isos.flatMap(iso => [`data/admin/${iso}-adm${level}.topo.json`, `data/admin/${iso}-adm${level}.detail.topo.json`]);

// The admin units of the coverage's countries, shaped like the country features the map already draws, so joins,
// cards, search, dashboard and exports work unchanged: ISO_A3 and WB_A3 hold the unit's code, NAM_0 its name.
// readText(path) reads a file of the map (or of the builder's preview). Unknown codes stop nothing: they are reported.
export async function loadAdminUnits(level, isos, readText) {
  const dictionary = JSON.parse(await readText('data/admin/dictionary.json'));
  const byCode = new Map(dictionary.units.map(u => [u.code, u]));
  const field = ADMIN_FIELDS[level], units = [];
  for (const iso of isos) {
    const [national, detail] = await Promise.all(adminFiles([iso], level).map(async path => decodeTopology(JSON.parse(await readText(path)))));
    const fine = new Map(detail.map(f => [f.properties[field], f.geometry]));
    for (const f of national) {
      const code = f.properties[field], u = byCode.get(code) || {}, name = u.name || UNNAMED;
      units.push({type: 'Feature', geometry: f.geometry, detailGeometry: fine.get(code),
        properties: {ISO_A3: code, WB_A3: code, NAM_0: name, label_html: esc(name), unit: level, parent: u.parent || '', country: iso, disputed: !!u.disputed}});
    }
  }
  return {units, dictionary: byCode};
}

// Admin unit names: the WB_GAD ADM1 / ADM2 label points (official names, placed by Cartography).
const LABELS = 'https://services.arcgis.com/iQ1dY19aHwbSDYIF/arcgis/rest/services/WB_GAD/FeatureServer';
const labelCache = new Map();
export function loadAdminNames(level, isos) {
  const key = `${level}:${isos.join(',')}`;
  if (!labelCache.has(key)) labelCache.set(key, (async () => {
    const where = `ISO_A3 IN (${isos.map(i => `'${i.replace(/[^A-Z]/g, '')}'`).join(',')})`;
    const r = await fetch(`${LABELS}/${level + 1}/query?where=${encodeURIComponent(where)}&outFields=NAM_${level},ADM${level}CD_t&outSR=4326&f=geojson`);
    if (!r.ok) throw new Error(`Admin names unavailable (HTTP ${r.status})`);
    const data = await r.json();
    return data.features.filter(f => f.properties[`NAM_${level}`] && f.properties[`NAM_${level}`] !== 'Administrative unit not available')
      .map(f => ({name: f.properties[`NAM_${level}`], code: f.properties[`ADM${level}CD_t`], coordinates: f.geometry.coordinates}));
  })().catch(e => { labelCache.delete(key); throw e; }));
  return labelCache.get(key);
}
