// wb-raster.js — raster thematic layers (standard 2.0). DO NOT EDIT PER PROJECT.
// Grids in data/raster/ (population, land cover, or a reviewed hazard or access raster), built by the standard's
// tools/raster_build.py from the recipes in gis/layers/. Drawn in the map's own projection as an image, so the flat
// view and every export match; values are read back for the card.

// A grid file -> {west, north, dx, dy, width, height, values (Float32Array with NaN, or Uint8Array with 0 = none)}.
export function decodeGrid(record) {
  const bin = atob(record.data), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const values = record.dtype === 'uint8' ? bytes : new Float32Array(bytes.buffer);
  return {...record, data: undefined, values};
}

// The grid cell under a lon/lat, or null.
export function cellAt(g, [lon, lat]) {
  const col = Math.floor((lon - g.west) / g.dx), row = Math.floor((g.north - lat) / g.dy);
  return col < 0 || row < 0 || col >= g.width || row >= g.height ? null : row * g.width + col;
}

// A PNG data URI covering [0, width] × [0, height] of the drawing: color(i) gives [r, g, b] for cell i, or null for
// none (transparent). Each image pixel takes the cell under its centre (projection.invert).
export function gridImage(projection, width, height, g, color, pixels = 1) {
  const cw = Math.round(width * pixels), ch = Math.round(height * pixels), canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const p = projection.invert([(x + 0.5) / pixels, (y + 0.5) / pixels]), i = p && cellAt(g, p);
    const c = i == null ? null : color(i);
    if (!c) continue;
    const k = (y * cw + x) * 4;
    img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// The raster of a tab into an SVG group, clipped to clip (GeoJSON: the covered countries) so neighbors stay plain.
export function drawRaster(group, projection, path, width, height, raster, {pixels = 1, clip = null} = {}) {
  const rgb = new Map(), color = i => { const c = raster.colorOf(raster.grid.values[i]); if (!c) return null; if (!rgb.has(c)) { const d = d3.rgb(c); rgb.set(c, [d.r, d.g, d.b]); } return rgb.get(c); };
  if (clip) { group.append('clipPath').attr('id', 'raster-clip').append('path').attr('d', path(clip)); }
  group.append('image').attr('class', 'raster').attr('href', gridImage(projection, width, height, raster.grid, color, pixels))
    .attr('x', 0).attr('y', 0).attr('width', width).attr('height', height).attr('preserveAspectRatio', 'none')
    .attr('clip-path', clip ? 'url(#raster-clip)' : null);
}
