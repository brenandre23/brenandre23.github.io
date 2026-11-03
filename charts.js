// charts.js — shared by both pages: HTML escaping, money formats, and Apache ECharts (vendor/echarts.min.js) with the World Bank brand tokens (brand/tokens.json of the webmap
// standard): one theme, SVG rendering, accessible descriptions, resizing, and no animation for reduced-motion users.
const WB = {brand: '#0071BC', brandDark: '#004a7c', pale: '#cfe3f3', vendor: '#8c9399', ok: '#1a7f4b', okDark: '#0e5a33',
  text: '#111111', muted: '#666666', line: '#dce1e4', page: '#e5eef5', font: "'Open Sans', system-ui, sans-serif"};
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
echarts.registerTheme('wb', {
  color: [WB.brand, WB.vendor, WB.ok, WB.okDark, WB.pale],
  textStyle: {fontFamily: WB.font, color: WB.text, fontSize: 13},
  title: {textStyle: {fontFamily: WB.font, fontWeight: 600, fontSize: 14, color: WB.text}},
  legend: {textStyle: {color: WB.muted, fontSize: 13}, itemWidth: 14, itemHeight: 14, icon: 'rect'},
  tooltip: {backgroundColor: '#fff', borderColor: WB.line, textStyle: {color: WB.text, fontSize: 13}, extraCssText: 'box-shadow:0 2px 8px rgba(0,0,0,.12);border-radius:6px;'},
  categoryAxis: {axisLine: {lineStyle: {color: WB.line}}, axisTick: {show: false}, axisLabel: {color: WB.muted}, splitLine: {show: false}},
  valueAxis: {axisLine: {show: false}, axisLabel: {color: WB.muted}, splitLine: {lineStyle: {color: WB.line}}}
});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const moneyShort = n => Math.abs(n) >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : Math.abs(n) >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + Math.round(n);
const narrow = el => el.clientWidth < 600;

// Draw (or redraw) a chart in el. option replaces the previous one; description is read by screen readers.
function chart(el, option, description) {
  // Phones: fewer value ticks, and wrapped category labels on horizontal bar charts, so the bars keep their room.
  if (narrow(el)) for (const ax of [].concat(option.xAxis || [], option.yAxis || [])) {
    if (ax.type === 'value') ax.splitNumber = 3;
    else if (ax === option.yAxis) ax.axisLabel = {...ax.axisLabel, width: 96, overflow: 'break'};
  }
  el.setAttribute('role', 'figure');   // the description below becomes its accessible name
  const c = echarts.getInstanceByDom(el) || echarts.init(el, 'wb', {renderer: 'svg'});
  c.setOption({aria: {enabled: true, label: {description}}, animation: !REDUCED, animationDuration: 500, animationDurationUpdate: 400, ...option}, true);
  return c;
}
// Charts whose layout differs on phones re-render when the window crosses the phone width (700 px).
function onBreakpoint(fn) {
  let phone = innerWidth < 700, timer;
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if ((innerWidth < 700) !== phone) { phone = !phone; fn(); } }, 200); });
}
let resizeQueued;
addEventListener('resize', () => { cancelAnimationFrame(resizeQueued); resizeQueued = requestAnimationFrame(() =>
  document.querySelectorAll('[_echarts_instance_]').forEach(el => echarts.getInstanceByDom(el)?.resize())); });

// Headline numbers, shared by portfolio.html and deck.html; fill() puts them into the {tokens} of data.js text.
function portfolioFacts() {
  const P = window.PORTFOLIO, PM = window.PRINT_MAPS || [], V = window.VALUE;
  const pending = P.pending.reduce((n, p) => n + (p.count || 1), 0), type = t => P.maps.filter(m => m.type === t).length;
  const deliverables = P.maps.length + pending + PM.length, hours = V ? V.workLog.hours.reduce((a, h) => a + h, 0) : 0;
  return {deliverables, hours, perDeliverable: hours ? (hours / deliverables).toFixed(1) : '?', print: PM.length, pending,
    series: new Set(PM.map(m => m.series)).size, areas: new Set(PM.map(m => m.area)).size, interactive: P.maps.length + pending,
    projects: new Set([...P.maps, ...P.pending].map(m => m.ws)).size, dashboards: type('Dashboard'), webmaps: type('Interactive map') + type('Flourish map'), prototypes: type('Prototype / explorer')};
}
const fill = (s, f) => String(s).replace(/\{(\w+)\}/g, (m, k) => k in f ? f[k] : m);
