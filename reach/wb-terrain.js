// wb-terrain.js — terrain (standard 2.0): hillshade, elevation tints and contours. DO NOT EDIT PER PROJECT.
// Drawn from data/context/elevation.json (Copernicus DEM GLO-30, built by the standard's tools/context_build.py from the
// recipe gis/layers/elevation.json), in the map's own projection, so the flat view and every export match.

// Styles (approved by the standard owner, October 2026): light from the north-west, muted tints, brown contours.
export const TERRAIN_STYLE = {
  hillshade: {azimuth: 315, altitude: 45, strength: 0.55},
  contours: {stroke: '#a88b6c', width: 0.35, index: 0.7, every: 5},
  tints: [[0, '#eef3e6'], [500, '#e6ecd5'], [1000, '#ece6cc'], [1500, '#e8dcc0'], [2500, '#e2d2bb'], [3500, '#ebe4dd'], [5000, '#f7f5f3']]
};
const INTERVALS = [50, 100, 200, 250, 500, 1000];

// The elevation grid: {west, north, dx, dy, width, height, values (Float32Array, NaN = no data), min, max, interval}.
export async function loadElevation(readText) {
  const g = JSON.parse(await readText('data/context/elevation.json')), bin = atob(g.data), values = new Float32Array(g.width * g.height);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = ((bin.charCodeAt(2 * i) | bin.charCodeAt(2 * i + 1) << 8) << 16) >> 16;
    values[i] = v === g.nodata ? NaN : v;
    if (v !== g.nodata) { min = Math.min(min, v); max = Math.max(max, v); }
  }
  const interval = INTERVALS.find(i => (max - Math.max(0, min)) / i <= 15) || 1000;   // about a dozen contour levels
  return {...g, values, min, max, interval, shade: shade({...g, values})};
}

// Hillshade per cell, 0 (in shadow) to 1 (lit), with Horn's slope; cell sizes in metres at the grid's latitude.
function shade(g) {
  const {width: w, height: h, values: z} = g, out = new Float32Array(w * h), {azimuth, altitude} = TERRAIN_STYLE.hillshade;
  const lat = (g.north - g.dy * h / 2) * Math.PI / 180, cx = g.dx * 111320 * Math.cos(lat), cy = g.dy * 111320;
  const zen = (90 - altitude) * Math.PI / 180, az = (360 - azimuth + 90) % 360 * Math.PI / 180;
  const at = (x, y) => { const v = z[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]; return Number.isNaN(v) ? 0 : v; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x + 1, y - 1), d = at(x - 1, y), f = at(x + 1, y), gg = at(x - 1, y + 1), hh = at(x, y + 1), i = at(x + 1, y + 1);
    const dzdx = ((c + 2 * f + i) - (a + 2 * d + gg)) / (8 * cx), dzdy = ((gg + 2 * hh + i) - (a + 2 * b + c)) / (8 * cy);
    const slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
    out[y * w + x] = Math.max(0, Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect));
  }
  return out;
}

const tint = v => {   // the tint ramp, linear between its stops
  const t = TERRAIN_STYLE.tints, k = t.findIndex(([e]) => e > v);
  if (k <= 0) return d3.rgb(t[k === 0 ? 0 : t.length - 1][1]);
  const [e0, c0] = t[k - 1], [e1, c1] = t[k];
  return d3.rgb(d3.interpolateRgb(c0, c1)((v - e0) / (e1 - e0)));
};

// The relief as a PNG data URI covering [0, width] × [0, height] of the drawing: tints (optional) darkened by the
// hillshade, transparent where the grid has no data. Drawn with mix-blend-mode multiply over the fills.
export function reliefImage(projection, width, height, g, {tints = false, pixels = 1} = {}) {
  const cw = Math.round(width * pixels), ch = Math.round(height * pixels), canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(cw, ch), strength = TERRAIN_STYLE.hillshade.strength;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const p = projection.invert([(x + 0.5) / pixels, (y + 0.5) / pixels]);
    if (!p) continue;
    const col = Math.floor((p[0] - g.west) / g.dx), row = Math.floor((g.north - p[1]) / g.dy);
    if (col < 0 || row < 0 || col >= g.width || row >= g.height) continue;
    const v = g.values[row * g.width + col];
    if (Number.isNaN(v)) continue;
    const light = 1 - strength * (1 - g.shade[row * g.width + col]), base = tints ? tint(v) : {r: 255, g: 255, b: 255}, k = (y * cw + x) * 4;
    img.data[k] = base.r * light; img.data[k + 1] = base.g * light; img.data[k + 2] = base.b * light; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// Contour lines every g.interval metres (every fifth an index contour), as lon/lat MultiLineStrings. The parts that run
// along the grid's edge (where d3.contours closes its rings) are left out.
export function contourLines(g) {
  const values = Array.from(g.values, v => Number.isNaN(v) ? -1e6 : v), levels = d3.range(Math.ceil(Math.max(1, g.min) / g.interval) * g.interval, g.max, g.interval);
  const edge = ([x, y]) => x <= 0 || y <= 0 || x >= g.width || y >= g.height;
  return d3.contours().size([g.width, g.height]).thresholds(levels)(values).map(c => {
    const lines = [];
    for (const ring of c.coordinates.flat()) {
      let line = [];
      for (let i = 0; i < ring.length; i++) {
        if (edge(ring[i]) && (i === 0 || edge(ring[i - 1]))) { if (line.length > 1) lines.push(line); line = []; continue; }
        line.push([g.west + ring[i][0] * g.dx, g.north - ring[i][1] * g.dy]);
      }
      if (line.length > 1) lines.push(line);
    }
    return {type: 'Feature', properties: {value: c.value, index: c.value % (g.interval * TERRAIN_STYLE.contours.every) === 0}, geometry: {type: 'MultiLineString', coordinates: lines}};
  });
}

// Draw relief and contours into an SVG group of a map drawn with projection/path over [0, width] × [0, height],
// clipped to clip (GeoJSON: the covered countries), so neighbors stay plain.
export function drawTerrain(group, projection, path, width, height, g, {hillshade = true, tints = false, contours = false, pixels = 1, scale = 1, screen = true, clip = null} = {}) {
  group.selectAll('*').remove();
  if (clip) { group.append('clipPath').attr('id', 'terrain-clip').append('path').attr('d', path(clip)); group.attr('clip-path', 'url(#terrain-clip)'); }
  if (hillshade || tints) group.append('image').attr('class', 'relief').attr('href', reliefImage(projection, width, height, g, {tints, pixels}))
    .attr('x', 0).attr('y', 0).attr('width', width).attr('height', height).attr('preserveAspectRatio', 'none').style('mix-blend-mode', 'multiply');
  if (!contours) return;
  const s = TERRAIN_STYLE.contours;
  for (const index of [false, true]) {
    const el = group.append('path').attr('class', index ? 'contours index' : 'contours').attr('fill', 'none').attr('stroke', s.stroke)
      .attr('stroke-width', (index ? s.index : s.width) * scale).attr('stroke-linejoin', 'round')
      .attr('d', path({type: 'FeatureCollection', features: (g.lines ||= contourLines(g)).filter(f => f.properties.index === index)}));
    if (screen) el.attr('vector-effect', 'non-scaling-stroke');
  }
}

// Legend entries: elevation tints (when shown) and the contour interval.
export function terrainLegend(g, {tints = false, contours = false} = {}) {
  const items = [];
  if (tints) {
    const stops = TERRAIN_STYLE.tints.filter(([e], i, a) => e < g.max && (i === a.length - 1 || a[i + 1][0] > Math.max(0, g.min)));
    stops.forEach(([e, color], i) => items.push({label: i === stops.length - 1 ? `${e.toLocaleString('en-US')} m or more` : `${e.toLocaleString('en-US')}–${stops[i + 1][0].toLocaleString('en-US')} m`, color, kind: 'area'}));
  }
  if (contours) items.push({label: `Contour (every ${g.interval.toLocaleString('en-US')} m)`, color: TERRAIN_STYLE.contours.stroke, kind: 'line', width: TERRAIN_STYLE.contours.width});
  return items;
}
