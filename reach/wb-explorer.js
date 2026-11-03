// wb-explorer.js — row-level linked exploration using the approved economy data and geometry.
import {COLORS, FONT, coverageProjection} from './wb-carto.js';

export function explorerRows(ctx, item) {
  return ctx.rows.filter(r => !r.inherited && r.value != null && Number.isFinite(r.value) &&
    (item.layout !== 'scatter' || Number.isFinite(r.values?.[item.xColumn])) &&
    (item.layout !== 'map' || Array.isArray(r.coordinates) && r.coordinates.every(Number.isFinite)));
}

// Place equal-size dots without inventing a second measure. Vertical displacement avoids collisions only.
export function swarmPositions(rows, x, radius = 5) {
  const placed = [], gap = radius * 2 + 2;
  for (const row of [...rows].sort((a,b) => a.value - b.value || a.iso.localeCompare(b.iso))) {
    const px = x(row.value), near = placed.filter(p => Math.abs(px-p.x) < gap);
    const candidates = [0];
    for (const p of near) {
      const dy = Math.sqrt(Math.max(0, gap*gap - (px-p.x)**2));
      candidates.push(p.y+dy, p.y-dy);
    }
    candidates.sort((a,b) => Math.abs(a)-Math.abs(b) || a-b);
    const py = candidates.find(y => near.every(p => (px-p.x)**2 + (y-p.y)**2 >= gap*gap - 0.01)) ?? 0;
    placed.push({row,x:px,y:py});
  }
  return placed;
}

const domain = values => {
  const [lo,hi] = d3.extent(values);
  if (lo === hi) return [lo-1,hi+1];
  const p = (hi-lo)*0.04;
  return [lo-p,hi+p];
};
const fit = (text,n) => text.length>n ? text.slice(0,n-1)+'…' : text;
export function drawExplorer(g, W, ctx, item, T, on) {
  const layout=item.layout || 'beeswarm', rows=explorerRows(ctx,{...item,layout}), fs=T.fs;
  if (!rows.length) {
    g.append('text').attr('y',fs*1.4).attr('font-size',fs).attr('fill',COLORS.textSubtle).text('No observations with the required bindings.');
    return fs*3;
  }
  const L=layout==='scatter'?56:16, R=16, top=24, radius=T.export?4:5;
  let height=300, points, x;
  if (layout === 'map') {
    height=Math.max(210,W*0.52)+top+24;
    // The map's coverage in its projection (the world in Equal Earth by default); neighbors in the outside gray.
    const world=!ctx.coverage || ctx.coverage.kind==='world', extent=world?{type:'Sphere'}:ctx.coverage.extent;
    const projection=(world?d3.geoEqualEarth():coverageProjection(ctx.coverage)).fitExtent([[8,top],[W-8,height-24]],extent), path=d3.geoPath(projection);
    g.append('clipPath').attr('id','explorer-frame').append('rect').attr('x',0).attr('y',top).attr('width',W).attr('height',height-24-top);
    g.append('path').datum({type:'Sphere'}).attr('d',path).attr('fill','#ffffff').attr('stroke','#b7c5ce').attr('clip-path','url(#explorer-frame)');
    if (ctx.countries?.length) g.append('g').attr('clip-path','url(#explorer-frame)').selectAll('path').data(ctx.countries).join('path').attr('d',path).attr('fill',f=>world||ctx.isInside?.(f)?COLORS.noData:COLORS.outside);
    points=rows.map(row=>({row,...Object.fromEntries(['x','y'].map((key,i)=>[key,projection(row.coordinates)[i]]))}));
  } else {
    x=d3.scaleLinear().domain(domain(rows.map(r=>layout==='scatter'?r.values[item.xColumn]:r.value))).range([L,W-R]).nice();
    if (layout === 'scatter') {
      const y=d3.scaleLinear().domain(domain(rows.map(r=>r.value))).range([height-58,top]).nice();
      points=rows.map(row=>({row,x:x(row.values[item.xColumn]),y:y(row.value)}));
      g.append('g').attr('transform',`translate(${L},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W-L-R)))
        .call(axis=>axis.selectAll('.tick line').attr('stroke','#e3e8ec')).call(axis=>axis.select('.domain').remove());
      g.append('text').attr('transform',`translate(15,${(height-58+top)/2}) rotate(-90)`).attr('text-anchor','middle')
        .attr('font-size',fs).attr('fill',COLORS.text).text(fit(ctx.map.legendTitle,32));
    } else {
      const placed=swarmPositions(rows,x,radius), spread=Math.max(radius,...placed.map(p=>Math.abs(p.y)));
      height=Math.max(220,spread*2+top+70);
      points=placed.map(p=>({...p,y:p.y+top+spread+12}));
    }
    g.append('g').attr('transform',`translate(0,${height-48})`).call(d3.axisBottom(x).ticks(Math.max(2,Math.floor(W/110))).tickFormat(d3.format('~s')))
      .call(axis=>axis.select('.domain').attr('stroke','#c9d2d8'));
    g.append('text').attr('x',(L+W-R)/2).attr('y',height-8).attr('font-size',fs).attr('text-anchor','middle').attr('fill',COLORS.text)
      .text(fit(layout==='scatter'?item.xColumn:ctx.map.legendTitle,Math.max(16,Math.floor(W/(fs*.55)))));
  }
  g.selectAll('.tick text').attr('font-family',FONT).attr('font-size',fs).attr('fill',COLORS.text);
  for (const p of points) {
    const row=p.row, selected=ctx.selected===row.iso, dim=ctx.filter!=null&&row.cls!==ctx.filter;
    const label=`${row.name}: ${ctx.fmt(row.value)}${layout==='scatter'?`; ${item.xColumn}: ${row.values[item.xColumn]}`:''}`;
    const mark=g.append('g').attr('class','dash-row').attr('data-iso',row.iso).attr('data-cls',row.cls).attr('transform',`translate(${p.x},${p.y})`);
    mark.append('circle').attr('class','hit').attr('r',12).attr('fill','transparent');
    mark.append('circle').attr('class','mark').attr('r',selected?radius+2:radius).attr('fill',row.color)
      .attr('stroke',selected?COLORS.text:'#666666').attr('stroke-width',selected?2:.5).attr('opacity',dim?.25:1);
    mark.append('title').text(label);
    if (on) mark.attr('role','button').attr('tabindex',0).attr('aria-label',label).attr('aria-pressed',String(selected)).style('cursor','pointer')
      .on('click',()=>on.select(row.iso)).on('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();on.select(row.iso);}})
      .on('pointerenter',()=>on.hover(row.iso)).on('pointerleave',()=>on.hover(null))
      .on('focus',()=>{mark.select('.hit').attr('stroke','#0071bc').attr('stroke-width',2);on.hover(row.iso);})
      .on('blur',()=>{mark.select('.hit').attr('stroke',null);on.hover(null);});
  }
  g.node().__explorer = {layout,count:rows.length,excluded:ctx.rows.filter(r=>!r.inherited).length-rows.length};
  return height;
}
