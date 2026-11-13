/* Shared observation rules. A plain script also works when opened locally. */
(function (root) {
  'use strict';
  const contentKey = r => `${r.slot_id}::${(r.object_name || r.headline || '').trim()}`;
  function compareSnapshots(before, after, platform = 'all') {
    if (!before || !after || before.date === after.date) return {ready:false, reason:'需要两次不同日期的采样', items:[], comparableSlots:[]};
    const shared = (before.covered_slots || []).filter(id => (after.covered_slots || []).includes(id));
    const eligible = r => shared.includes(r.slot_id) && (platform === 'all' || r.app_key === platform);
    const a = new Map(before.records.filter(eligible).map(r => [contentKey(r), r]));
    const b = new Map(after.records.filter(eligible).map(r => [contentKey(r), r]));
    const items = [];
    for (const [key, r] of b) {
      const old = a.get(key);
      if (!old) items.push({status:'seen', row:r, before:null});
      else if (['headline','copy','app_copy','period_text','rank','score'].some(k => (old[k] || '') !== (r[k] || ''))) items.push({status:'changed', row:r, before:old});
      else items.push({status:'same', row:r, before:old});
    }
    for (const [key, r] of a) if (!b.has(key)) items.push({status:'not_seen', row:r, before:r});
    const platformMatches = id => platform === 'all' || [...before.records, ...after.records].some(r => r.slot_id === id && r.app_key === platform);
    return {
      ready:true, items, comparableSlots:shared.filter(platformMatches),
      unmatchedSlots:[...new Set([...(before.covered_slots || []), ...(after.covered_slots || [])])].filter(id => !shared.includes(id) && platformMatches(id)),
      routeChanged:before.route_version !== after.route_version
    };
  }
  function datePresentation(date, latest, today) {
    return {
      headline:date === today ? '今天在推什么' : '这一天在推什么',
      showcase:date === today ? '今日首屏焦点图' : '当日首屏焦点图',
      notice:date !== latest ? `正在看历史日期 ${date}，最新一次采样是 ${latest}。` : date !== today ? `今天还没有新的采样，下面是 ${date} 的记录，不代表今天的情况。` : ''
    };
  }
  function selectionAfterUpdate(current, previousDates, nextDates) {
    const wasLatest = current === previousDates.at(-1);
    return wasLatest || !nextDates.includes(current) ? nextDates.at(-1) : current;
  }
  const BUCKETS = ['tencent', 'other', 'unknown', 'topic'];
  const emptyShares = () => Object.fromEntries(BUCKETS.map(k => [k, 0]));
  const mean = values => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;
  function calendarDays(start, end) {
    const a = Date.parse(start+'T00:00:00Z'), b = Date.parse(end+'T00:00:00Z');
    return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b-a)/86400000)+1 : 0;
  }
  function dateRange(preset, today, firstDate, customStart, customEnd) {
    if (preset === 'custom') return {start:customStart, end:customEnd};
    if (preset === 'all') return {start:firstDate, end:today};
    const count = preset === 'today' ? 1 : Number(preset);
    const start = new Date(today+'T00:00:00Z');
    start.setUTCDate(start.getUTCDate()-(count-1));
    return {start:start.toISOString().slice(0,10),end:today};
  }
  function bucketFor(row) {
    if (!row.object_name) return 'topic';
    return row.ownership?.status === 'confirmed' && ['tencent','other'].includes(row.ownership.bucket) ? row.ownership.bucket : 'unknown';
  }
  function uniqueRows(records) {
    const seen = new Set();
    return records.filter(r => {const k=contentKey(r);if(seen.has(k))return false;seen.add(k);return true;});
  }
  function dailySlot(snapshot, slot) {
    const rows=uniqueRows(snapshot.records.filter(r=>r.slot_id===slot.id));
    // A missing or empty observation has no numeric share, never zero.
    if (!snapshot.covered_slots.includes(slot.id) || !rows.length) return null;
    const counts=emptyShares(), companies={};
    for(const r of rows){const bucket=bucketFor(r);counts[bucket]++;
      const company=bucket==='topic'?'平台活动／专题':bucket==='unknown'?'待核实':r.ownership.company;
      companies[company]=(companies[company]||0)+1;
    }
    const shares=Object.fromEntries(BUCKETS.map(k=>[k,counts[k]/rows.length]));
    return {date:snapshot.date,slot,rows,count:rows.length,counts,shares,companies:Object.fromEntries(Object.entries(companies).map(([k,n])=>[k,n/rows.length]))};
  }
  function aggregate(data,{start,end,platform='all',priority='all'}={}) {
    const validRange=calendarDays(start,end)>0;
    const snapshots=validRange?data.snapshots.filter(s=>s.date>=start&&s.date<=end).sort((a,b)=>a.date.localeCompare(b.date)):[];
    const slots=data.slots.filter(s=>(platform==='all'||s.app===platform)&&(priority==='all'||s.priority===priority)).sort((a,b)=>a.order-b.order);
    const summaries=slots.map(slot=>{
      const days=snapshots.map(s=>dailySlot(s,slot)).filter(Boolean);
      const shares=Object.fromEntries(BUCKETS.map(k=>[k,mean(days.map(d=>d.shares[k]))]));
      const names=[...new Set(days.flatMap(d=>Object.keys(d.companies)))];
      const companies=names.map(name=>({name,share:mean(days.map(d=>d.companies[name]||0))})).sort((a,b)=>b.share-a.share||a.name.localeCompare(b.name,'zh-CN'));
      return {slot,days,shares,companies,sampleDays:days.length,records:days.reduce((n,d)=>n+d.count,0),tencentDays:days.filter(d=>d.counts.tencent>0).length};
    });
    const daySamples=summaries.flatMap(s=>s.days);
    const shares=Object.fromEntries(BUCKETS.map(k=>[k,mean(daySamples.map(d=>d.shares[k]))]));
    const rows=daySamples.flatMap(d=>d.rows).sort((a,b)=>b.sample_date.localeCompare(a.sample_date)||a.slot_id.localeCompare(b.slot_id)||a.record_id.localeCompare(b.record_id));
    const dates=[...new Set(daySamples.map(d=>d.date))].sort();
    // Overall uses equal observed placement-days, not exposure or content weights.
    const timeline=dates.map(date=>({date,slots:daySamples.filter(d=>d.date===date).length,shares:Object.fromEntries(BUCKETS.map(k=>[k,mean(daySamples.filter(d=>d.date===date).map(d=>d.shares[k]))]))}));
    const last=snapshots.at(-1),before=snapshots.at(-2);
    const diff=compareSnapshots(before,last,platform);
    if(diff.ready) diff.items=diff.items.filter(x=>slots.some(s=>s.id===x.row.slot_id));
    return {start,end,validRange,calendarDays:calendarDays(start,end),summaries,shares,rows,dates,timeline,diff,slotDays:daySamples.length,observedSlots:summaries.filter(s=>s.sampleDays).length,expectedSlots:slots.length,unknownProducts:[...new Set(rows.filter(r=>bucketFor(r)==='unknown').map(r=>r.object_name))],snapshots};
  }
  function insights(view) {
    if(!view.slotDays)return [{title:'区间内没有样本',text:'请调整日期或平台。没有采样的日期不补 0，也不沿用前一天。'}];
    const ranked=view.summaries.filter(s=>s.sampleDays&&s.shares.tencent>0).sort((a,b)=>b.shares.tencent-a.shares.tencent||a.slot.order-b.slot.order);
    const results=[];
    if(ranked.length){const first=ranked[0],ties=ranked.filter(x=>Math.abs(x.shares.tencent-first.shares.tencent)<1e-10);
      results.push({title:'腾讯占比较高的位置',text:ties.slice(0,3).map(x=>x.slot.platform+' '+x.slot.name).join('、')+(ties.length>3?`等 ${ties.length} 个位置`:'')+`，区间日均均为 ${(first.shares.tencent*100).toFixed(1)}%。仅比较已采内容。`});
    }else results.push({title:'已采内容中未见腾讯产品',text:'这只反映当前日期与位置范围内的样本，不能推断全天没有资源。'});
    const companyTotals={};
    view.summaries.forEach(s=>s.days.forEach(d=>d.rows.filter(r=>bucketFor(r)==='other').forEach(r=>{const c=r.ownership.company;companyTotals[c]=(companyTotals[c]||0)+1/d.count;})));
    const other=Object.entries(companyTotals).sort((a,b)=>b[1]-a[1]);
    if(other.length)results.push({title:'其他发行／运营方',text:other.slice(0,3).map(([name,n])=>`${name} ${(n/view.slotDays*100).toFixed(1)}%`).join('、')+'，按已采位置日等权汇总。'});
    if(view.dates.length<2) results.push({title:'首日基线，暂不判断趋势',text:`当前区间只有 ${view.dates.length} 个有效采样日。至少两天且采到相同位置后，再判断新增和换内容。`});
    else if(view.diff.ready){const chosen=new Set(view.summaries.map(s=>s.slot.id));const common=view.diff.comparableSlots.filter(id=>chosen.has(id));
      results.push({title:'最近两次采样变化',text:common.length?`${view.snapshots.at(-2).date} → ${view.snapshots.at(-1).date}，共同覆盖 ${common.length} 个位置：新出现 ${view.diff.items.filter(x=>x.status==='seen').length} 条、换内容 ${view.diff.items.filter(x=>x.status==='changed').length} 条、本次未见 ${view.diff.items.filter(x=>x.status==='not_seen').length} 条。${view.diff.routeChanged?'两次采样路线不同，需谨慎比较。':''}`:'最近两次没有共同覆盖的位置，暂不能比较。'});
    }
    return results;
  }
  function masterCsv(rows) {
    const cols=[['sample_date','日期'],['platform','平台'],['page','页面'],['slot_id','资源位ID'],['slot_name','资源位名称'],['priority','位置级别'],['object_name','游戏或应用'],['headline','主标题'],['copy','文案'],['owner_category','归属分类'],['owner_company','发行／运营方'],['owner_operator','公开主体'],['owner_status','核对状态'],['owner_sources','归属依据'],['observed_at','采样时间'],['screenshot','截图证据'],['record_id','记录ID']];
    const labels={tencent:'腾讯',other:'其他厂商',unknown:'待核实',topic:'平台活动／专题'};
    const quote=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    const lines=rows.map(r=>({...r,priority:r.priority==='focus'?'重点':'其他',owner_category:labels[bucketFor(r)],owner_company:r.ownership?.company||labels[bucketFor(r)],owner_operator:r.ownership?.operator||'',owner_status:r.ownership?.status==='confirmed'?'已核对':bucketFor(r)==='topic'?'非产品':'待核实',owner_sources:(r.ownership?.sources||[]).map(s=>s.url).join(' | ')}));
    return '\uFEFF'+[cols.map(c=>quote(c[1])).join(','),...lines.map(r=>cols.map(c=>quote(r[c[0]])).join(','))].join('\r\n');
  }
  root.ResourceWatchModel = {contentKey, compareSnapshots, datePresentation, selectionAfterUpdate,BUCKETS,calendarDays,dateRange,bucketFor,uniqueRows,dailySlot,aggregate,insights,masterCsv};
})(globalThis);
