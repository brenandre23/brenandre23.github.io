// globe.js: the 3D landing page (./), drawn with three.js r158 (vendor/three).
// Reads the same data as portfolio.html: data.js (PORTFOLIO), print-maps.js (PRINT_MAPS), globe-geo.js (GLOBE_GEO).
// Countries with work get a pin; workstreams without a single country orbit the globe as cards.
// Every dashboard stays on its own server (Design Studio, Flourish, Vercel) and opens in a new tab.
(() => {
'use strict';
const P = window.PORTFOLIO, PRINTS = window.PRINT_MAPS || [], GEO = window.GLOBE_GEO;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- data
// Print-map "area" → country. Areas not listed here (World, Africa, regions) are global or regional.
const AREA_ISO = {'DR Congo': 'COD', 'India': 'IND', 'Botswana': 'BWA', 'Dominican Republic': 'DOM', 'Yemen': 'YEM', 'South Sudan': 'SSD',
  'Ukraine': 'UKR', 'Iraq': 'IRQ', 'Syria': 'SYR', 'Mali': 'MLI', 'Nauru': 'NRU', 'Liberia': 'LBR', 'Rwanda': 'RWA', 'South Africa': 'ZAF',
  'Timor-Leste': 'TLS', 'Angola': 'AGO', 'Zambia': 'ZMB'};
// Interactive items that belong to one country (the rest orbit as workstreams).
const MAP_ISO = {'angola-sync': 'AGO', 'jupiter-courts': 'DOM'};
// Pin positions (a point inside each country, not the polygon centroid, which falls outside for some).
const LL = {AGO: [-12.3, 17.6], BWA: [-22.2, 24.0], COD: [-2.9, 23.6], DOM: [18.8, -70.4], IND: [22.5, 79.0], IRQ: [33.1, 43.7],
  LBR: [6.4, -9.4], MLI: [17.4, -3.5], NRU: [-0.53, 166.93], RWA: [-1.95, 29.9], SSD: [7.3, 30.3], SYR: [35.0, 38.5],
  TLS: [-8.8, 125.9], UKR: [49.0, 31.4], YEM: [15.6, 47.6], ZAF: [-29.5, 24.7], ZMB: [-13.4, 27.8]};
const HQ = {name: 'Washington, DC', ll: [38.9, -77.04]};
const NAMES = {};
GEO.countries.forEach(c => { NAMES[c.iso] ||= c.name; });

const countries = {};
const country = iso => countries[iso] ||= {iso, name: NAMES[iso] || iso, prints: [], maps: []};
const regional = {};
PRINTS.forEach(p => { const iso = AREA_ISO[p.area]; if (iso) country(iso).prints.push(p); else (regional[p.area] ||= []).push(p); });
const streams = new Map();
P.maps.forEach(m => {
  const iso = MAP_ISO[m.id];
  if (iso) { country(iso).maps.push(m); return; }
  if (!streams.has(m.ws)) streams.set(m.ws, {ws: m.ws, maps: []});
  streams.get(m.ws).maps.push(m);
});
const countryList = Object.values(countries).filter(c => LL[c.iso]).map(c => ({...c, total: c.prints.length + c.maps.length}))
  .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
const byIso = Object.fromEntries(countryList.map(c => [c.iso, c]));
const streamList = [...streams.values()];  // data.js order (Food & Nutrition Security is listed last on purpose)
const regionalList = Object.entries(regional).sort((a, b) => b[1].length - a[1].length);
const pendingCount = (P.pending || []).reduce((n, p) => n + (p.count || 0), 0);
const areas = new Set(PRINTS.map(p => p.area)).size;
const series = new Set(PRINTS.map(p => p.series)).size;

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const TYPE_WORDS = {'Dashboard': ['dashboard', 'dashboards'], 'Interactive map': ['interactive map', 'interactive maps'], 'Flourish map': ['Flourish map', 'Flourish maps'],
  'Prototype / explorer': ['prototype', 'prototypes and explorers']};
const typeWord = list => { const t = [...new Set(list.map(m => m.type))]; return t.length === 1 && TYPE_WORDS[t[0]] ? TYPE_WORDS[t[0]][list.length > 1 ? 1 : 0] : 'maps and dashboards'; };
const initials = s => s.split(/[\s/&×]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmtDate = d => d ? new Date(d + (d.length === 7 ? '-01' : '') + 'T12:00').toLocaleDateString('en-GB', {day: d.length > 7 ? 'numeric' : undefined, month: 'short', year: 'numeric'}) : '';

// ---------------------------------------------------------------- hero stats
$('stats').innerHTML = [[PRINTS.length, 'print and report maps'], [P.maps.length + pendingCount, 'interactive maps and dashboards'],
  [series, 'map series'], [areas, 'countries and regions']].map(([n, l]) => `<div><dt>${l}</dt><dd>${n}</dd></div>`).join('');
$('hero-eyebrow').textContent = `${P.unit} · ${P.period}`;

// ---------------------------------------------------------------- drawer
const drawer = $('drawer'), body = $('drawer-body');
let view = {kind: 'home'};

function mapCard(m) {
  const thumb = m.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy">` : `<span class="ph" aria-hidden="true">${esc(initials(m.ws))}</span>`;
  return `<article class="card">
    <a class="thumb" href="${esc(m.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${thumb}</a>
    <div class="c-body"><span class="tag">${esc(m.type)}</span>
      <h4>${esc(m.title)}</h4>
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}
      <a class="open" href="${esc(m.url)}" target="_blank" rel="noopener">Open live <span aria-hidden="true">↗</span><span class="sr-only"> (${esc(m.title)}, new tab)</span></a>
    </div></article>`;
}
function printGrid(list) {
  return `<div class="prints">${list.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(p => `
    <figure class="print"><a href="static/${esc(p.code)}.jpg" target="_blank" rel="noopener" aria-label="${esc(p.title)} (image, new tab)">
      <img src="static/${esc(p.code)}.jpg" alt="" loading="lazy"></a>
      <figcaption><b>${esc(p.title)}</b>${esc(p.series)}${p.date ? ' · ' + esc(fmtDate(p.date)) : ''}</figcaption></figure>`).join('')}</div>`;
}
function rowsHtml(items, max) {
  return `<ul class="rows">${items.map(it => `<li><button type="button" class="row" data-go="${esc(it.go)}">
    <span><span class="name">${esc(it.name)}</span><span class="sub">${esc(it.sub)}</span>
    ${max ? `<span class="bar" style="width:${Math.max(8, 100 * it.n / max).toFixed(0)}%"></span>` : ''}</span>
    <span class="count">${it.n}</span></button></li>`).join('')}</ul>`;
}
function render(next, opts = {}) {
  view = next;
  const head = (eyebrow, title, meta) => { $('drawer-eyebrow').textContent = eyebrow; $('drawer-title').textContent = title; $('drawer-meta').textContent = meta || ''; };
  $('back').hidden = view.kind === 'home';
  let html = '';
  if (view.kind === 'home') {
    head('Explore', 'Where the work is', `${countryList.length} countries with their own maps, ${streamList.length} global workstreams in orbit.`);
    const maxC = countryList[0]?.total || 1;
    html += `<p class="intro">Turn the globe or pick from the lists. Dashboards open live on the servers that host them; print maps open as images.</p>`;
    html += `<section class="group"><h3>Countries</h3>${rowsHtml(countryList.map(c => ({go: 'c:' + c.iso, name: c.name, n: c.total,
      sub: [c.prints.length && plural(c.prints.length, 'print map'), c.maps.length && plural(c.maps.length, 'interactive', 'interactive')].filter(Boolean).join(' · ')})), maxC)}</section>`;
    html += `<section class="group"><h3>Global workstreams</h3>${rowsHtml(streamList.map(s => ({go: 'w:' + s.ws, name: s.ws, n: s.maps.length, sub: typeWord(s.maps)})))}</section>`;
    html += `<section class="group"><h3>Global and regional print maps</h3>${rowsHtml(regionalList.map(([area, l]) => ({go: 'r:' + area, name: area, n: l.length,
      sub: [...new Set(l.map(p => p.series))].slice(0, 2).join(' · ')})))}</section>`;
    if (pendingCount) html += `<p class="foot">Plus ${pendingCount} ${esc(P.pending[0].ws)} maps awaiting public links. Updated ${esc(fmtDate(P.updated))}.</p>`;
  } else if (view.kind === 'country') {
    const c = byIso[view.iso];
    head('Country', c.name, [c.prints.length && plural(c.prints.length, 'print map'), c.maps.length && plural(c.maps.length, 'interactive map or dashboard', 'interactive maps and dashboards')].filter(Boolean).join(' · '));
    if (c.maps.length) html += `<section class="group"><h3>Interactive</h3><div class="cards">${c.maps.map(mapCard).join('')}</div></section>`;
    if (c.prints.length) html += `<section class="group"><h3>Print and report maps</h3>${printGrid(c.prints)}</section>`;
  } else if (view.kind === 'stream') {
    const s = streams.get(view.ws);
    head('Global workstream', s.ws, `${s.maps.length} ${typeWord(s.maps)}`);
    html += `<div class="cards">${s.maps.map(mapCard).join('')}</div>`;
  } else if (view.kind === 'regional') {
    const l = regional[view.area];
    head(view.area === 'World' ? 'Global' : 'Regional', `${view.area} print maps`, plural(l.length, 'map'));
    html += printGrid(l);
  }
  body.innerHTML = html;
  body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');
  body.scrollTop = 0;
  if (opts.focus) drawer.focus({preventScroll: true});
  if (matchMedia('(max-width: 960px)').matches) drawer.classList.toggle('tall', view.kind !== 'home');
  scene3d?.onView(view);
  const h = toHash(view); if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
}
function toHash(v) { return v.kind === 'country' ? '#c=' + v.iso : v.kind === 'stream' ? '#w=' + encodeURIComponent(v.ws) : v.kind === 'regional' ? '#r=' + encodeURIComponent(v.area) : ''; }
function fromHash() {
  const m = /^#([cwr])=(.+)$/.exec(location.hash); if (!m) return null;
  const v = decodeURIComponent(m[2]);
  if (m[1] === 'c' && byIso[v]) return {kind: 'country', iso: v};
  if (m[1] === 'w' && streams.has(v)) return {kind: 'stream', ws: v};
  if (m[1] === 'r' && regional[v]) return {kind: 'regional', area: v};
  return null;
}
body.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  const [k, v] = [b.dataset.go.slice(0, 1), b.dataset.go.slice(2)];
  render(k === 'c' ? {kind: 'country', iso: v} : k === 'w' ? {kind: 'stream', ws: v} : {kind: 'regional', area: v}, {focus: true});
});
body.addEventListener('pointerover', e => { const b = e.target.closest('[data-go^="c:"]'); scene3d?.setHover(b ? b.dataset.go.slice(2) : null); });
body.addEventListener('pointerleave', () => scene3d?.setHover(null));
$('back').addEventListener('click', () => render({kind: 'home'}, {focus: true}));
addEventListener('keydown', e => { if (e.key === 'Escape' && view.kind !== 'home') render({kind: 'home'}); });

// ---------------------------------------------------------------- 3D scene
let scene3d = null;
try { scene3d = createScene(); } catch (err) {
  console.error(err);
  $('globe').remove();
  $('stage').insertAdjacentHTML('beforeend', '<p class="fallback">The 3D globe could not start in this browser (WebGL is unavailable). Everything is still listed on the right, and in the <a href="portfolio.html">full portfolio</a>.</p>');
  $('hint').hidden = true;
}
render(fromHash() || {kind: 'home'});
addEventListener('hashchange', () => { const v = fromHash(); if (v) render(v); });

function createScene() {
  if (!window.THREE) throw new Error('three.js did not load');
  const T = THREE, canvas = $('globe');
  const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance'});
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
  const globe = new T.Group(); scene.add(globe);
  const R = 1;
  const ll2v = (lat, lon, r = R) => new T.Vector3(r * Math.cos(lat * D2R) * Math.sin(lon * D2R), r * Math.sin(lat * D2R), r * Math.cos(lat * D2R) * Math.cos(lon * D2R));

  // ---- land mask: World Bank boundaries rasterised to an equirectangular canvas; colour encodes the country.
  const MW = 2048, MH = 1024, mask = document.createElement('canvas');
  mask.width = MW; mask.height = MH;
  const mx = mask.getContext('2d', {willReadFrequently: true});
  const isoIds = [...new Set(GEO.countries.map(c => c.iso))], idOf = Object.fromEntries(isoIds.map((iso, i) => [iso, i + 1]));
  const tracePath = rings => {
    mx.beginPath();
    for (const r of rings) {
      for (let i = 0; i < r.length; i += 2) {
        const x = (r[i] + 180) / 360 * MW, y = (90 - r[i + 1]) / 180 * MH;
        i ? mx.lineTo(x, y) : mx.moveTo(x, y);
      }
      mx.closePath();
    }
  };
  for (const c of GEO.countries) { const id = idOf[c.iso]; mx.fillStyle = `rgb(${id & 255},${id >> 8},255)`; tracePath(c.r); mx.fill('evenodd'); }
  mx.fillStyle = 'rgb(0,0,200)';
  for (const n of GEO.ndlsa) { tracePath(n.r); mx.fill('evenodd'); }
  const px = mx.getImageData(0, 0, MW, MH).data;
  const sample = (lat, lon) => {
    const x = Math.min(MW - 1, Math.max(0, Math.floor((lon + 180) / 360 * MW))), y = Math.min(MH - 1, Math.max(0, Math.floor((90 - lat) / 180 * MH)));
    const k = (y * MW + x) * 4, b = px[k + 2];
    if (b < 150) return 0;                       // ocean (or an anti-aliased coast)
    if (b < 230) return -1;                      // disputed area (World Bank NDLSA rule: no country colour)
    return px[k] + (px[k + 1] << 8);
  };

  // ---- dot-matrix land
  const workIds = new Set(countryList.map(c => idOf[c.iso]));
  const STEP = 0.5, pos = [], col = [], cid = [];
  const cLand = new T.Color('#6f9fd0'), cWork = new T.Color('#39b0ff'), cNd = new T.Color('#4a5868');
  for (let lat = -84; lat <= 84; lat += STEP) {
    const n = Math.max(1, Math.round(360 * Math.cos(lat * D2R) / STEP));
    for (let i = 0; i < n; i++) {
      const lon = -180 + (i + (Math.round(lat / STEP) % 2 ? 0.5 : 0)) * 360 / n;
      const id = sample(lat, lon); if (!id) continue;
      const v = ll2v(lat, lon, R * 1.002); pos.push(v.x, v.y, v.z);
      const c = id === -1 ? cNd : workIds.has(id) ? cWork : cLand; col.push(c.r, c.g, c.b); cid.push(id);
    }
  }
  const dotGeo = new T.BufferGeometry();
  dotGeo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  dotGeo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  dotGeo.setAttribute('cid', new T.Float32BufferAttribute(cid, 1));
  const dotMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {uScale: {value: 2}, uHover: {value: -9}, uSelect: {value: -9}, uTime: {value: 0}},
    vertexShader: `
      attribute vec3 color; attribute float cid;
      uniform float uScale, uHover, uSelect, uTime;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float sel = step(abs(cid - uSelect), 0.5), hov = step(abs(cid - uHover), 0.5);
        float hl = max(sel, hov * 0.7);
        vColor = mix(color, vec3(0.86, 0.96, 1.0), hl * (0.65 + 0.15 * sin(uTime * 3.0)));
        vec3 n = normalize(normalMatrix * position);
        float facing = dot(n, normalize(-mv.xyz));
        vAlpha = smoothstep(-0.05, 0.4, facing) * (0.7 + 0.3 * facing) + hl * 0.2;
        gl_PointSize = uScale * (1.0 + 0.45 * hl) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.3, d));
      }`
  });
  globe.add(new T.Points(dotGeo, dotMat));

  // ---- ocean sphere with a fresnel rim, and an atmosphere halo behind it
  const ocean = new T.Mesh(new T.SphereGeometry(R, 96, 64), new T.ShaderMaterial({
    uniforms: {},
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
        vec3 base = mix(vec3(0.018, 0.06, 0.115), vec3(0.03, 0.11, 0.2), vN.y * 0.5 + 0.5);
        gl_FragColor = vec4(base + vec3(0.12, 0.42, 0.8) * f * 0.6, 1.0);
      }`
  }));
  globe.add(ocean);
  const halo = new T.Mesh(new T.SphereGeometry(R * 1.2, 64, 48), new T.ShaderMaterial({
    side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: `varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vN; void main() { float i = pow(max(0.0, 0.58 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(0.22, 0.6, 1.0, 1.0) * i * 1.25; }`
  }));
  scene.add(halo);

  // ---- starfield (far, slow)
  const starPos = [];
  for (let i = 0; i < 900; i++) { const v = new T.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20); starPos.push(v.x, v.y, v.z); }
  const starGeo = new T.BufferGeometry(); starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
  const stars = new T.Points(starGeo, new T.PointsMaterial({color: 0x9fc9ee, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false}));
  scene.add(stars);

  // ---- pins, pulse rings, arcs from Washington
  const up = new T.Vector3(0, 1, 0), hits = [], pins = {};
  const headMat = new T.MeshBasicMaterial({color: 0xe8f7ff});
  const hitMat = new T.MeshBasicMaterial({visible: false});
  const maxTotal = countryList[0]?.total || 1;
  for (const c of countryList) {
    const [lat, lon] = LL[c.iso], n = ll2v(lat, lon).normalize();
    const h = 0.05 + 0.17 * Math.sqrt(c.total / maxTotal);
    const g = new T.Group(); g.position.copy(n.clone().multiplyScalar(R)); g.quaternion.setFromUnitVectors(up, n);
    const spikeMat = new T.MeshBasicMaterial({color: 0x39b0ff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false});
    const spike = new T.Mesh(new T.CylinderGeometry(0.0045, 0.0075, h, 10, 1, true), spikeMat); spike.position.y = h / 2;
    const head = new T.Mesh(new T.SphereGeometry(0.011, 16, 12), headMat); head.position.y = h;
    const ringMat = new T.MeshBasicMaterial({color: 0x39b0ff, transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending});
    const ring = new T.Mesh(new T.RingGeometry(0.016, 0.021, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002;
    const hit = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, h + 0.06, 8), hitMat); hit.position.y = (h + 0.06) / 2; hit.userData.iso = c.iso;
    g.add(spike, head, ring, hit); globe.add(g); hits.push(hit);
    pins[c.iso] = {g, head, ring, ringMat, spikeMat, h, phase: Math.random() * 3, top: n.clone().multiplyScalar(R + h + 0.01)};
  }
  const hq = ll2v(...HQ.ll).normalize();
  { const g = new T.Group(); g.position.copy(hq); g.quaternion.setFromUnitVectors(up, hq);
    const m = new T.Mesh(new T.RingGeometry(0.012, 0.02, 40), new T.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.85, side: T.DoubleSide}));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.003; g.add(m); globe.add(g); }
  const arcMats = [];
  for (const c of countryList) {
    const b = ll2v(...LL[c.iso]).normalize(), ang = hq.angleTo(b), lift = 0.05 + 0.2 * ang / Math.PI, N = 96;
    const pts = [], ts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, v = new T.Vector3().copy(hq).lerp(b, t).normalize();
      // slerp-ish: lerp+normalize is close enough below ~150 degrees; lift follows a sine.
      pts.push(...v.multiplyScalar(R + 0.004 + lift * Math.sin(Math.PI * t)).toArray()); ts.push(t);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); geo.setAttribute('aT', new T.Float32BufferAttribute(ts, 1));
    const mat = new T.ShaderMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: {uTime: {value: 0}, uOff: {value: Math.random()}, uHi: {value: 0}},
      vertexShader: `attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uOff, uHi; varying float vT;
        void main() {
          float head = fract(uTime * 0.16 + uOff) * 1.35;
          float d = head - vT;
          float trail = d > 0.0 && d < 0.3 ? pow(1.0 - d / 0.3, 2.0) : 0.0;
          float a = 0.07 + 0.25 * uHi + trail * (0.75 + 0.25 * uHi);
          gl_FragColor = vec4(mix(vec3(0.36, 0.78, 1.0), vec3(0.9, 0.97, 1.0), trail), a);
        }`});
    arcMats.push([c.iso, mat]); globe.add(new T.Line(geo, mat));
  }

  // ---- orbiting workstream cards (DOM, positioned from 3D each frame)
  const orbitEl = $('orbit'), cards = [];
  streamList.forEach((s, i) => {
    const thumbOf = s.maps.find(m => m.thumb)?.thumb;
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'orbit-card'; el.tabIndex = -1;
    el.innerHTML = `${thumbOf ? `<img src="${esc(thumbOf)}" alt="" draggable="false">` : `<span class="ph">${esc(initials(s.ws))}</span>`}
      <span class="oc-body"><span class="oc-kicker">${plural(s.maps.length, 'item')}</span><span class="oc-title">${esc(s.ws)}</span></span>`;
    el.addEventListener('click', () => render({kind: 'stream', ws: s.ws}, {focus: true}));
    el.addEventListener('pointerenter', () => { hoverCard = el; });
    el.addEventListener('pointerleave', () => { if (hoverCard === el) hoverCard = null; });
    orbitEl.append(el);
    cards.push({el, ws: s.ws, a0: i / streamList.length * Math.PI * 2});
  });
  orbitEl.style.pointerEvents = 'none';

  // ---- layout: the globe sits in the space the hero and drawer leave free
  let W = 0, H = 0, ringR = 1.75, baseDist = 3.6, zoom = 1, isMobile = false;
  const hero = document.querySelector('.hero');
  function layout() {
    W = innerWidth; H = innerHeight; isMobile = W <= 960;
    const pr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    const dr = drawer.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    let cx, cy, rpx;
    if (isMobile) {
      const top = hr.bottom + 8, bottom = dr.top - 8;
      cx = W / 2; cy = (top + bottom) / 2; rpx = Math.max(70, Math.min((bottom - top) / 2 * 0.78, W * 0.3)); ringR = 1.42;
    } else {
      const left = hr.right * 0.82, right = dr.left - 16;
      cx = (left + right) / 2; cy = H * 0.53; rpx = Math.max(120, Math.min(H * 0.31, (right - left) / 2 * 0.64)); ringR = 1.46;
    }
    const tanHalf = Math.tan(camera.fov / 2 * D2R);
    baseDist = H / (2 * tanHalf * rpx) ;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    camera.updateProjectionMatrix();
    // Dots: about 70% of their spacing on screen, so the land reads as a fine halftone.
    dotMat.uniforms.uScale.value = 0.0087 * rpx * pr * (baseDist - 1) * 0.72;
  }
  addEventListener('resize', layout); layout();
  new ResizeObserver(layout).observe(drawer);

  // ---- interaction: drag to turn (with inertia), wheel / pinch to zoom, click pins
  let spin = -20 * D2R, tilt = 12 * D2R, vSpin = 0, vTilt = 0, target = null, lastInput = -1e9, hoverCard = null;
  let hoverIso = null, listHoverIso = null, selectedIso = null, selectedWs = null;
  const pointers = new Map(); let pinch0 = 0, zoom0 = 1, downAt = null, moved = 0;
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const pick = (x, y) => {
    ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(hits, false)[0];
    if (h) return {iso: h.object.userData.iso};
    const o = ray.intersectObject(ocean, false)[0];
    if (o) { const p = globe.worldToLocal(o.point.clone()).normalize(); const lat = Math.asin(p.y) / D2R, lon = Math.atan2(p.x, p.z) / D2R;
      const id = sample(lat, lon); return {land: id, lat, lon}; }
    return null;
  };
  const cardAt = (x, y) => document.elementsFromPoint(x, y).find(e => e.classList?.contains('orbit-card'));
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoom; }
    downAt = [e.clientX, e.clientY]; moved = 0; vSpin = vTilt = 0; target = null; lastInput = performance.now();
  });
  canvas.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) {
      const prev = pointers.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      pointers.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; zoom = clampZoom(zoom0 * pinch0 / Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]))); }
      else if (moved > 4) {
        canvas.classList.add('dragging');
        const k = 1 / (H * 0.33) * zoom; vSpin = dx * k; vTilt = dy * k; spin += vSpin; tilt = clampTilt(tilt + vTilt);
      }
      lastInput = performance.now(); hideTip(); return;
    }
    hover(e.clientX, e.clientY);
  });
  const end = e => {
    pointers.delete(e.pointerId); canvas.classList.remove('dragging');
    if (downAt && moved < 6 && pointers.size === 0) click(e.clientX, e.clientY);
    downAt = null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { hoverIso = null; hideTip(); canvas.classList.remove('pointing'); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = clampZoom(zoom * Math.exp(e.deltaY * 0.0012)); lastInput = performance.now(); }, {passive: false});
  const clampZoom = z => Math.min(1.6, Math.max(0.55, z));
  const clampTilt = t => Math.min(1.15, Math.max(-1.15, t));

  const tip = $('tooltip');
  function showTip(x, y, html) { tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect(); tip.style.transform = `translate(${Math.min(x + 14, W - r.width - 8)}px, ${Math.max(8, y - r.height - 12)}px)`; }
  function hideTip() { tip.hidden = true; }
  function hover(x, y) {
    const c = cardAt(x, y);
    if (c && !c.classList.contains('back')) { canvas.classList.add('pointing'); hoverIso = null; hideTip(); return; }
    if (c) { canvas.classList.add('pointing'); hoverIso = null; hideTip(); return; }
    const p = pick(x, y);
    if (p?.iso) {
      hoverIso = p.iso; const k = byIso[p.iso]; canvas.classList.add('pointing');
      showTip(x, y, `<strong>${esc(k.name)}</strong><span>${[k.prints.length && plural(k.prints.length, 'print map'), k.maps.length && plural(k.maps.length, 'interactive', 'interactive')].filter(Boolean).join(' · ')} · click to open</span>`);
      return;
    }
    canvas.classList.remove('pointing'); hoverIso = null;
    if (p?.land > 0) { const iso = isoIds[p.land - 1];
      if (byIso[iso]) { hoverIso = iso; canvas.classList.add('pointing'); showTip(x, y, `<strong>${esc(byIso[iso].name)}</strong><span>click to open</span>`); }
      else showTip(x, y, `<strong>${esc(NAMES[iso])}</strong>`);
    } else hideTip();
  }
  function click(x, y) {
    const c = cardAt(x, y); if (c) { c.click(); return; }
    const p = pick(x, y);
    const iso = p?.iso || (p?.land > 0 && byIso[isoIds[p.land - 1]] ? isoIds[p.land - 1] : null);
    if (iso) render({kind: 'country', iso}, {focus: false});
  }
  function flyTo(lat, lon) {
    let s = -lon * D2R; const two = Math.PI * 2;
    s = spin + ((((s - spin) % two) + two + Math.PI) % two - Math.PI);
    target = {spin: s, tilt: clampTilt(lat * D2R * 0.85)}; vSpin = vTilt = 0;
  }

  // ---- frame loop
  const clock = new T.Clock(), tmp = new T.Vector3(), labelEl = $('pin-label');
  let ringAngle = 0, visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) { clock.getDelta(); requestAnimationFrame(frame); } });
  const ringTilt = new T.Euler(0.6, 0, -0.08);
  function frame() {
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, now = performance.now();
    if (target) {
      spin += (target.spin - spin) * Math.min(1, dt * 4); tilt += (target.tilt - tilt) * Math.min(1, dt * 4);
      if (Math.abs(target.spin - spin) < 1e-3 && Math.abs(target.tilt - tilt) < 1e-3) target = null;
    } else if (!pointers.size) {
      spin += vSpin; tilt = clampTilt(tilt + vTilt); vSpin *= 0.93; vTilt *= 0.9;
      if (!reduceMotion && !selectedIso && now - lastInput > 2500) spin += dt * 0.05;
      if (!selectedIso && now - lastInput > 2500) tilt += (12 * D2R - tilt) * dt * 0.4;
    }
    globe.rotation.set(tilt, spin, 0);
    stars.rotation.y = spin * 0.08;
    const dist = baseDist * zoom; camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
    dotMat.uniforms.uTime.value = t;
    const hl = listHoverIso || hoverIso;
    dotMat.uniforms.uHover.value = hl ? idOf[hl] : -9;
    dotMat.uniforms.uSelect.value = selectedIso ? idOf[selectedIso] : -9;
    for (const iso in pins) {
      const p = pins[iso], on = iso === selectedIso || iso === hl;
      const k = reduceMotion ? 0.5 : ((t * 0.55 + p.phase) % 1);
      p.ring.scale.setScalar(1 + k * 2.6); p.ringMat.opacity = (1 - k) * (on ? 0.95 : 0.55);
      p.head.scale.setScalar(on ? 1.7 : 1); p.spikeMat.color.set(on ? 0xbfe9ff : 0x39b0ff);
    }
    for (const [iso, m] of arcMats) { m.uniforms.uTime.value = reduceMotion ? 0.4 : t; m.uniforms.uHi.value = iso === selectedIso || iso === hl ? 1 : 0; }

    // Orbit cards: project, scale by depth, send the far half behind the canvas.
    if (!reduceMotion && !hoverCard) ringAngle += dt * 0.045;
    for (const c of cards) {
      const a = c.a0 + ringAngle;
      tmp.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR).applyEuler(ringTilt);
      const depth = tmp.z / ringR, behind = tmp.z < 0;
      tmp.project(camera);
      const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H;
      const s = (0.62 + 0.38 * (depth + 1) / 2) * (c.el === hoverCard ? 1.06 : 1) / Math.sqrt(zoom);
      c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      c.el.style.opacity = (0.35 + 0.65 * (depth + 1) / 2).toFixed(2);
      c.el.classList.toggle('back', behind);
      c.el.classList.toggle('active', c.ws === selectedWs);
    }
    // Label on the selected (or hovered-from-list) country's pin.
    const lab = selectedIso || listHoverIso;
    if (lab && pins[lab]) {
      tmp.copy(pins[lab].top).applyMatrix4(globe.matrixWorld);
      const facing = tmp.clone().normalize().dot(camera.position.clone().normalize()) > 0.15;
      tmp.project(camera);
      labelEl.hidden = !facing; labelEl.textContent = byIso[lab].name;
      labelEl.style.transform = `translate(${((tmp.x + 1) / 2 * W).toFixed(1)}px, ${((1 - tmp.y) / 2 * H).toFixed(1)}px) translate(-50%, calc(-100% - 10px))`;
    } else labelEl.hidden = true;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    onView(v) {
      selectedIso = v.kind === 'country' ? v.iso : null;
      selectedWs = v.kind === 'stream' ? v.ws : null;
      if (selectedIso) flyTo(...LL[selectedIso]);
      if (isMobile) requestAnimationFrame(layout);
    },
    setHover(iso) { listHoverIso = iso; if (iso && !selectedIso && !pointers.size) { flyTo(...LL[iso]); lastInput = performance.now(); } }
  };
}
})();
