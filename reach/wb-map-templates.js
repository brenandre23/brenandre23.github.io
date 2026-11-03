// Thematic observations over the approved World Bank geography. No boundary sources.
import {COLORS, namePlain, lookupRow} from './wb-carto.js';
import {drawRaster} from './wb-raster.js';
import {appendWbs, hasSymbol} from './wb-context.js';

export const TEMPLATE_NAMES = {
  choropleth: 'Choropleth', 'proportional-symbol': 'Proportional symbols', locator: 'Locator',
  flow: 'Connections', route: 'Routes', heatmap: 'Point density', extrusion: 'Elevated regions', reference: 'Reference map', raster: 'Raster layer'
};

// Densification follows great circles. d3's geographic path clips at the antimeridian;
// splitting the same coordinates gives MapLibre short segments rather than world-wide chords.
export function greatCircle(a, b) {
  const interpolate = d3.geoInterpolate(a, b);
  const count = Math.max(2, Math.ceil(d3.geoDistance(a, b) * 180 / Math.PI / 2));
  return Array.from({length: count + 1}, (_, i) => interpolate(i / count));
}
export function splitAntimeridian(coordinates) {
  const parts = [[]];
  for (const point of coordinates) {
    const part = parts.at(-1), previous = part.at(-1);
    if (previous && Math.abs(point[0] - previous[0]) > 180) {
      const direction = previous[0] > 0 ? 1 : -1, edge = 180 * direction;
      const wrapped = point[0] + 360 * direction;
      const ratio = (edge - previous[0]) / (wrapped - previous[0]);
      const latitude = previous[1] + (point[1] - previous[1]) * ratio;
      part.push([edge, latitude]); parts.push([[-edge, latitude], point]);
    } else part.push(point);
  }
  return parts.filter(part => part.length > 1);
}
export function templateData(map, countries, state, year, classify) {
  const kind = map.mapTemplate || 'choropleth', spatial = map.spatialParsed;
  const rows = spatial ? spatial.rows.filter(r => !map.spatialData.timeColumn || !r.time || String(r.time) === String(year)) : [];
  const color = value => map.spatialData?.valueColumn ? classify(value, map).color : map.colors.at(-1);
  const result = {kind, points: [], lines: [], colors: map.colors, maxValue: 0, rows, missing: 0,
    sized: kind === 'proportional-symbol' || kind === 'flow' && !!map.spatialData?.valueColumn};
  if (kind === 'raster') {   // cell colors: the class of each value, or the category's color; none for no data
    const categories = map.rasterInfo.kind === 'categorical' && new Map(map.rasterInfo.categories.map(c => [c.value, c.color]));
    result.raster = {grid: map.rasterGrid, colorOf: v => categories ? categories.get(v) || null : Number.isNaN(v) ? null : classify(v, map).color};
  } else if (kind === 'proportional-symbol' && !spatial) {
    const economies = new Map();
    for (const f of countries) {
      const iso=f.properties.ISO_A3, s=state.get(f.id);
      if(iso==='TWN' || s.value==null || s.inheritedFrom)continue;
      if(!economies.has(iso))economies.set(iso,[]);
      economies.get(iso).push(f);
    }
    result.points = [...economies].map(([iso,features]) => {
      const f=features[0],s=state.get(f.id);
      return {coordinates:d3.geoCentroid({type:'FeatureCollection',features}),value:s.value,
        label:namePlain(f.properties),color:s.color,iso};
    });
  } else if (['proportional-symbol', 'locator', 'heatmap'].includes(kind)) {
    result.points = rows.map(r => ({...r, color: color(r.value)}));
  } else if (kind === 'flow') {
    result.lines = rows.map(r => ({...r, coordinates: greatCircle(r.source, r.target), color: color(r.value)}));
  } else if (kind === 'route') {
    const groups = new Map();
    for (const row of rows) { const group = JSON.stringify([row.group,row.time]); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(row); }
    result.lines = [...groups].map(([label, vertices]) => {
      vertices.sort((a, b) => a.order - b.order);
      return {label:vertices[0].label || vertices[0].group, value: null, color: map.colors.at(-1), coordinates: vertices.flatMap((r,i) => i ? greatCircle(vertices[i-1].coordinates,r.coordinates).slice(1) : [r.coordinates])};
    });
  }
  const scaled = kind === 'proportional-symbol' ? result.points : kind === 'flow' && map.spatialData?.valueColumn ? result.lines : [];
  if (scaled.some(r => r.value != null && r.value < 0)) throw new Error(`${TEMPLATE_NAMES[kind]} requires nonnegative sizing values; use a choropleth or locator for signed values.`);
  if (scaled.length) {
    result.missing = scaled.filter(r => r.value == null).length;
    const allValues = spatial ? spatial.rows.map(r => r.value) : map.type === 'timeseries'
      ? countries.filter(f=>f.properties.ISO_A3 !== 'TWN').flatMap(f => { const {row, inheritedFrom} = lookupRow(f.properties, map.table); return inheritedFrom || !row ? [] : Object.values(row.years); })
      : scaled.map(r => r.value);
    result.maxValue = d3.max(allValues) || 0;
    if (kind === 'proportional-symbol') result.points = scaled.filter(r => r.value != null);
    else result.lines = scaled.filter(r => r.value != null);
  }
  if(kind==='extrusion') {
    const values=map.type==='timeseries'?countries.filter(f=>f.properties.ISO_A3!=='TWN').flatMap(f=>{const {row}=lookupRow(f.properties,map.table);return row?Object.values(row.years):[];}):[...state.values()].map(s=>s.value);
    result.maxValue=d3.max(values.filter(v=>v!=null)) || 0;
  }
  return result;
}

// pt: drawing units per pt of a standard symbol (locator tabs draw each site as the World Bank Project Location symbol).
export function drawFlatTemplate(group, projection, data, width = 1000, onObservation = null, hitScale = 1, height = width * 0.75, clip = null, pixels = 1, pt = width / 1000) {
  group.selectAll('*').remove();
  group.attr('class', 'map-template-overlay').attr('data-template', data.kind).attr('pointer-events', 'none');
  const unit = width / 1000, path = d3.geoPath(projection);
  if (data.kind === 'raster') return drawRaster(group, projection, path, width, height, data.raster, {pixels, clip});
  if (data.kind === 'heatmap') {
    const points = data.points.map(r => projection(r.coordinates)).filter(p => p && p.every(Number.isFinite));
    if (!points.length) return;
    const density = d3.contourDensity().x(p => p[0]).y(p => p[1]).size([Math.ceil(width), Math.ceil(width)]).bandwidth(18 * unit).thresholds(12)(points);
    const max = d3.max(density, d => d.value) || 1;
    group.selectAll('path').data(density).join('path').attr('class', 'density-contour')
      .attr('d', d3.geoPath()).attr('fill', d => data.colors[Math.min(data.colors.length - 1, Math.floor(d.value / max * (data.colors.length - 1)))])
      .attr('fill-opacity', .65).append('title').text(d => `Relative point density: ${(d.value / max).toFixed(2)}`);
  } else if (data.lines.length) {
    group.selectAll('path').data(data.lines).join('path').attr('class', 'spatial-line')
      .attr('d', d => path({type: 'LineString', coordinates: d.coordinates}))
      .attr('fill', 'none').attr('stroke', d => d.color).attr('stroke-opacity', .8)
      .attr('stroke-width', d => data.sized ? data.maxValue ? 8 * Math.sqrt((d.value || 0) / data.maxValue) : 0 : 2)
      .attr('vector-effect', 'non-scaling-stroke').append('title').text(d => d.label || 'Route');
  } else if (data.kind === 'locator' && hasSymbol('project-location')) {
    for (const d of data.points) {
      const xy = projection(d.coordinates);
      if (xy) appendWbs(group, 'project-location', xy[0], xy[1], pt, 'spatial-point').datum(d).attr('data-value', d.value)
        .append('title').text(`${d.label || 'Observation'}${d.value != null ? ': ' + d.value : ''}`);
    }
  } else {
    group.selectAll('circle').data(data.points).join('circle').attr('class', 'spatial-point')
      .attr('cx', d => projection(d.coordinates)?.[0]).attr('cy', d => projection(d.coordinates)?.[1])
      .attr('r', d => unit * (data.kind === 'proportional-symbol' ? data.maxValue ? 24 * Math.sqrt(d.value / data.maxValue) : 0 : 5))
      .attr('fill', d => d.color).attr('fill-opacity', .8).attr('stroke', COLORS.text).attr('stroke-width', .6)
      .attr('data-value', d => d.value).append('title').text(d => `${d.label || 'Observation'}${d.value != null ? ': ' + d.value : ''}`);
  }
  if(onObservation && data.kind!=='heatmap') {
    const observations=data.lines.length?data.lines:data.points;
    for(const row of observations) {
      const label=`${row.label || 'Observation'}${row.value==null?'':': '+row.value}`;
      const hit=group.append(data.lines.length?'path':'circle').datum(row).attr('class','spatial-hit');
      if(data.lines.length)hit.attr('d',path({type:'LineString',coordinates:row.coordinates})).attr('fill','none').attr('stroke','transparent').attr('stroke-width',24).attr('vector-effect','non-scaling-stroke').style('pointer-events','stroke');
      else {const xy=projection(row.coordinates);hit.attr('cx',xy[0]).attr('cy',xy[1]).attr('r',13/Math.max(.01,hitScale)).attr('fill','transparent').style('pointer-events','all');}
      hit.attr('role','button').attr('tabindex',0).attr('aria-label',label).style('cursor','pointer')
        .on('click',e=>{e.stopPropagation();onObservation(row,e,true);})
        .on('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onObservation(row,e,true);}})
        .on('focus',e=>{hit.attr('stroke','#0071bc');onObservation(row,e,false);})
        .on('blur',()=>{hit.attr('stroke',data.lines.length?'transparent':null);onObservation(null,null,false);});
    }
  }

}
