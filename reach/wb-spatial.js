// Strict thematic CSV observations. Country geography continues to come from WB_GAD.
import {parseNumber, spatialDataProblems} from './wb-carto.js';

/** Return validated rows and GeoJSON observations without changing the supplied rows.
 * Routes are grouped by route identifier and observation year. Vertex values are
 * retained on properties.rows; a route-level value exists only when all agree.
 */
export function parseSpatialData(rows, spec, options = {}) {
  const problems = spatialDataProblems(spec);
  if (problems.length) throw new Error(problems.join('; '));
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${spec.dataFile}: spatial dataset is empty`);
  const columns = Array.isArray(rows.columns) ? rows.columns : Object.keys(rows[0] || {});
  for (const [key, column] of Object.entries(spec)) {
    if (key.endsWith('Column') && !columns.includes(column)) throw new Error(`${spec.dataFile}: ${key} names missing column "${column}"`);
  }
  const template = options.mapTemplate || ({points: 'locator', flows: 'flow', routes: 'route'}[spec.kind]);
  const nonnegative = ['proportional-symbol', 'flow', 'extrusion'].includes(template);
  const parsed = rows.map((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${spec.dataFile}: row ${index + 2} must be a record`);
    const where = column => `${spec.dataFile}: row ${index + 2}, column "${column}"`;
    const numeric = (column, required = false) => {
      const value = parseNumber(input[column], where(column));
      if (required && value === null) throw new Error(`${where(column)}: a numeric value is required`);
      if (value !== null && !Number.isFinite(value)) throw new Error(`${where(column)}: value must be finite`);
      return value;
    };
    const coordinate = (latitudeColumn, longitudeColumn) => {
      const latitude = numeric(latitudeColumn, true), longitude = numeric(longitudeColumn, true);
      if (latitude < -90 || latitude > 90) throw new Error(`${where(latitudeColumn)}: latitude must be between -90 and 90`);
      if (longitude < -180 || longitude > 180) throw new Error(`${where(longitudeColumn)}: longitude must be between -180 and 180`);
      return [longitude, latitude];
    };
    const value = spec.valueColumn ? numeric(spec.valueColumn) : null;
    if (nonnegative && value !== null && value < 0) throw new Error(`${where(spec.valueColumn)}: ${template} quantities must be nonnegative`);
    const timeText = spec.timeColumn ? String(input[spec.timeColumn] ?? '').trim() : '';
    if (timeText && !/^\d{4}$/.test(timeText)) throw new Error(`${where(spec.timeColumn)}: time must be a four-digit year or blank`);
    const row = {index, rowNumber: index + 2, value, label: spec.labelColumn ? String(input[spec.labelColumn] ?? '').trim() : '', time: timeText || null};
    if (spec.kind === 'flows') {
      row.source = coordinate(spec.sourceLatitudeColumn, spec.sourceLongitudeColumn);
      row.target = coordinate(spec.targetLatitudeColumn, spec.targetLongitudeColumn);
      row.coordinates = [row.source, row.target];
    } else row.coordinates = coordinate(spec.latitudeColumn, spec.longitudeColumn);
    if (spec.kind === 'routes') {
      row.group = String(input[spec.groupColumn] ?? '').trim();
      if (!row.group) throw new Error(`${where(spec.groupColumn)}: a route identifier is required`);
      row.order = numeric(spec.orderColumn, true);
    }
    return row;
  });
  let features;
  if (spec.kind === 'routes') {
    const groups = new Map();
    for (const row of parsed) {
      const key = JSON.stringify([row.group, row.time]);
      if (!groups.has(key)) groups.set(key, {vertices: [], orders: new Set()});
      const {vertices, orders} = groups.get(key);
      if (orders.has(row.order)) throw new Error(`${spec.dataFile}: row ${row.rowNumber}, column "${spec.orderColumn}": duplicate order ${row.order} in route "${row.group}"${row.time ? ` for ${row.time}` : ''}`);
      orders.add(row.order); vertices.push(row);
    }
    features = [...groups.values()].map(({vertices}) => {
      if (vertices.length < 2) throw new Error(`${spec.dataFile}: route "${vertices[0].group}"${vertices[0].time ? ` for ${vertices[0].time}` : ''} needs at least two coordinate rows (row ${vertices[0].rowNumber})`);
      const ordered = [...vertices].sort((a, b) => a.order - b.order), first = ordered[0];
      const value = ordered.every(v => v.value === first.value) ? first.value : null;
      return {type: 'Feature', geometry: {type: 'LineString', coordinates: ordered.map(r => r.coordinates)}, properties: {group: first.group, label: first.label, time: first.time, value, rows: ordered}};
    });
  } else features = parsed.map(row => ({type: 'Feature', geometry: {type: spec.kind === 'points' ? 'Point' : 'LineString', coordinates: row.coordinates}, properties: {...row}}));
  return {kind: spec.kind, rows: parsed, features: {type: 'FeatureCollection', features}, years: [...new Set(parsed.map(r => r.time).filter(Boolean))].sort()};
}
