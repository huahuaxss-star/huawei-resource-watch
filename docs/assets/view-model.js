/* Shared observation rules. A plain script also works when opened locally. */
(function (root) {
  'use strict';
  const contentKey = r => `${r.slot_id}::${(r.object_name || r.headline || '').trim()}`;
  function selectDataset(data,id=data.default_dataset||'huawei-single') {
    const registry=data.datasets||[{id:'huawei-single',label:'华为 · 单框',vendor_name:'华为',edition_name:'单框',visible:true}];
    const dataset=registry.find(d=>d.id===id);
    if(!dataset)throw new Error('Unknown dataset: '+id);
    const belongs=x=>(x.dataset_id||'huawei-single')===id;
    const slots=data.slots.filter(belongs),ids=new Set(slots.map(s=>s.id));
    const snapshots=data.snapshots.filter(belongs).map(s=>({...s,records:s.records.filter(r=>belongs(r)&&ids.has(r.slot_id)),covered_slots:s.covered_slots.filter(k=>ids.has(k))}));
    return {...data,slots,snapshots,dataset,selected_dataset:id};
  }
  function compareSnapshots(before, after, platform = 'all', {contentType='all'}={}) {
    if (!before || !after || before.date === after.date) return {ready:false, reason:'需要两个不同日期的记录', items:[], comparableSlots:[]};
    // A type filter must not turn a different content category into a removal.
    if(contentType!=='all'){
      const narrow=s=>{const records=s.records.filter(r=>matchesContentType(r,contentType));return {...s,records,covered_slots:(s.covered_slots||[]).filter(id=>records.some(r=>r.slot_id===id))};};
      before=narrow(before);after=narrow(after);
    }
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
      notice:date !== latest ? `正在看历史日期 ${date}，最新记录是 ${latest}。` : date !== today ? `今天暂无更新，下面是 ${date} 的记录，不代表今天的情况。` : ''
    };
  }
  function selectionAfterUpdate(current, previousDates, nextDates, {pinned=false}={}) {
    if(pinned&&nextDates.includes(current))return current;
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
  function matchesContentType(row,contentType='all') {
    if(contentType==='all')return true;
    return ['game','app'].includes(contentType)&&Boolean(row.object_name)&&row.ownership?.product_type===contentType;
  }
  function uniqueRows(records) {
    const seen = new Set();
    return records.filter(r => {const k=contentKey(r);if(seen.has(k))return false;seen.add(k);return true;});
  }
  function dailySlot(snapshot, slot, {contentType='all'}={}) {
    const rows=uniqueRows(snapshot.records.filter(r=>r.slot_id===slot.id&&matchesContentType(r,contentType)));
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
  function aggregate(data,{start,end,platform='all',priority='all',datasetId,contentType='all'}={}) {
    if(data.datasets&&!data.selected_dataset)data=selectDataset(data,datasetId);
    const validRange=calendarDays(start,end)>0;
    const snapshots=validRange?data.snapshots.filter(s=>s.date>=start&&s.date<=end).sort((a,b)=>a.date.localeCompare(b.date)):[];
    const slots=data.slots.filter(s=>(platform==='all'||s.app===platform)&&(priority==='all'||s.priority===priority)).sort((a,b)=>a.order-b.order);
    const summaries=slots.map(slot=>{
      const days=snapshots.map(s=>dailySlot(s,slot,{contentType})).filter(Boolean);
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
    const diff=compareSnapshots(before,last,platform,{contentType});
    if(diff.ready) diff.items=diff.items.filter(x=>slots.some(s=>s.id===x.row.slot_id));
    return {start,end,contentType,validRange,calendarDays:calendarDays(start,end),summaries,shares,rows,dates,timeline,diff,slotDays:daySamples.length,observedSlots:summaries.filter(s=>s.sampleDays).length,expectedSlots:slots.length,unknownProducts:[...new Set(rows.filter(r=>bucketFor(r)==='unknown').map(r=>r.object_name))],snapshots};
  }
  function insights(view) {
    if(!view.slotDays)return [{title:'该范围暂无数据',text:'可选择其他日期或平台查看。'}];
    const ranked=view.summaries.filter(s=>s.sampleDays&&s.shares.tencent>0).sort((a,b)=>b.shares.tencent-a.shares.tencent||a.slot.order-b.slot.order);
    const results=[];
    if(ranked.length){const first=ranked[0],ties=ranked.filter(x=>Math.abs(x.shares.tencent-first.shares.tencent)<1e-10);
      results.push({title:'腾讯占比较高的位置',text:ties.slice(0,3).map(x=>x.slot.platform+' '+x.slot.name).join('、')+(ties.length>3?`等 ${ties.length} 个位置`:'')+`，区间日均均为 ${(first.shares.tencent*100).toFixed(1)}%。`});
    }else results.push({title:'当前记录中未出现腾讯产品',text:'当前日期范围内没有相关展示记录。'});
    const companyTotals={};
    view.summaries.forEach(s=>s.days.forEach(d=>d.rows.filter(r=>bucketFor(r)==='other').forEach(r=>{const c=r.ownership.company;companyTotals[c]=(companyTotals[c]||0)+1/d.count;})));
    const other=Object.entries(companyTotals).sort((a,b)=>b[1]-a[1]);
    if(other.length)results.push({title:'其他发行／运营方',text:other.slice(0,3).map(([name,n])=>`${name} ${(n/view.slotDays*100).toFixed(1)}%`).join('、')+'，按资源位与日期计算。'});
    if(view.dates.length>=2&&view.diff.ready){const chosen=new Set(view.summaries.map(s=>s.slot.id));const common=view.diff.comparableSlots.filter(id=>chosen.has(id));
      results.push({title:'近期资源变化',text:common.length?`${view.snapshots.at(-2).date} → ${view.snapshots.at(-1).date}，共同覆盖 ${common.length} 个位置：新出现 ${view.diff.items.filter(x=>x.status==='seen').length} 条、换内容 ${view.diff.items.filter(x=>x.status==='changed').length} 条、本次未见 ${view.diff.items.filter(x=>x.status==='not_seen').length} 条。${view.diff.routeChanged?'两次记录的页面范围不同，比较范围以共同位置为准。':''}`:'最近两次没有共同覆盖的位置，暂不能比较。'});
    }
    return results;
  }
  function dailyReport(data,date,{platform='all',priority='all',datasetId,contentType='all'}={}) {
    if(data.datasets&&!data.selected_dataset)data=selectDataset(data,datasetId);
    const view=aggregate(data,{start:date,end:date,platform,priority,contentType});
    const ordered=data.snapshots.slice().sort((a,b)=>a.date.localeCompare(b.date));
    const after=ordered.find(s=>s.date===date),before=ordered.filter(s=>s.date<date).at(-1);
    const chosen=new Set(view.summaries.map(s=>s.slot.id));
    const nonempty=s=>s?{...s,covered_slots:s.covered_slots.filter(id=>s.records.some(r=>r.slot_id===id))}:s;
    const raw=compareSnapshots(nonempty(before),nonempty(after),platform,{contentType});
    const comparableSlots=(raw.comparableSlots||[]).filter(id=>chosen.has(id));
    const items=raw.items.filter(x=>chosen.has(x.row.slot_id));
    const changedSlots=[...new Set(items.filter(x=>x.status!=='same').map(x=>x.row.slot_id))];
    const counts=Object.fromEntries(['seen','changed','not_seen','same'].map(k=>[k,items.filter(x=>x.status===k).length]));
    return {view,date,previousDate:before?.date||null,ready:Boolean(raw.ready&&comparableSlots.length),
      comparableSlots,changedSlots,items,counts,routeChanged:raw.routeChanged||false,
      unmatchedSlots:(raw.unmatchedSlots||[]).filter(id=>chosen.has(id))};
  }
  function queryRecords(rows,{query='',owner='all',page=1,size=25,contentType='all'}={}) {
    const q=query.trim().toLocaleLowerCase();
    const filtered=rows.filter(r=>matchesContentType(r,contentType)&&(owner==='all'||bucketFor(r)===owner)&&(!q||
      [r.sample_date,r.object_name,r.headline,r.slot_name,r.platform,r.ownership?.company,r.ownership?.operator].join(' ').toLocaleLowerCase().includes(q)));
    const safeSize=Math.min(100,Math.max(1,Math.floor(Number(size)||25)));
    const pages=Math.max(1,Math.ceil(filtered.length/safeSize));
    const current=Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
    return {filtered,rows:filtered.slice((current-1)*safeSize,current*safeSize),page:current,pages,total:filtered.length,size:safeSize};
  }
  function gameHistory(data,{game='',start=null,end=null,vendor='all'}={}) {
    const gameName=typeof game==='string'?game.trim():'';
    const vendorList=[['huawei','华为'],['oppo','OPPO'],['vivo','vivo'],['xiaomi','小米'],['honor','荣耀']];
    const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    start=start||null;end=end||null;
    const validRange=(!start||validDate(start))&&(!end||validDate(end))&&(!start||!end||start<=end);
    const selectedVendor=vendor==='all'||vendorList.some(([id])=>id===vendor)?vendor:'all';
    const registry=data.datasets||[{id:'huawei-single',vendor:'huawei',label:'华为 · 单框',vendor_name:'华为',edition_name:'单框',visible:true}];
    const ordered=(a,b)=>b.sample_date.localeCompare(a.sample_date)||a.dataset_id.localeCompare(b.dataset_id)||a.slot_id.localeCompare(b.slot_id)||String(a.record_id||'').localeCompare(String(b.record_id||''));
    const datesOf=records=>[...new Set(records.map(row=>row.sample_date))].sort((a,b)=>b.localeCompare(a));
    const allHistory=[];
    const vendors=vendorList.map(([id,name])=>{
      const included=selectedVendor==='all'||selectedVendor===id;
      const groups=registry.filter(scope=>scope.visible&&scope.vendor===id).map(scope=>{
        const selected=selectDataset(data,scope.id);
        const scopeRecords=selected.snapshots.filter(snapshot=>!snapshot.status||snapshot.status==='reviewed').flatMap(snapshot=>snapshot.records.filter(row=>row.sample_date===snapshot.date&&snapshot.covered_slots.includes(row.slot_id)));
        const seen=new Set();
        const history=scopeRecords.filter(row=>gameName&&typeof row.object_name==='string'&&row.object_name.trim()===gameName&&matchesContentType(row,'game')).map(row=>({...row,dataset_id:scope.id,dataset_label:scope.label||scope.id,vendor:id,vendor_name:name,edition_name:scope.edition_name||row.edition_name||''})).sort(ordered).filter(row=>{
          const key=JSON.stringify([row.dataset_id,row.sample_date,row.slot_id,gameName]);
          if(seen.has(key))return false;seen.add(key);return true;
        });
        allHistory.push(...history);
        const records=included&&validRange?history.filter(row=>(!start||row.sample_date>=start)&&(!end||row.sample_date<=end)):[];
        const historyDates=datesOf(history),hasData=scopeRecords.length>0;
        const status=!included?'excluded':!hasData?'no_records':!history.length?'game_not_seen':!validRange?'invalid_range':!records.length?'no_matches_in_range':'matched';
        return {datasetId:scope.id,label:scope.label||scope.id,editionName:scope.edition_name||'',hasData,status,records,dates:datesOf(records),uniqueSlots:new Set(records.map(row=>row.slot_id)).size,firstDate:historyDates.at(-1)||null,latestDate:historyDates[0]||null,allGameRecordCount:history.length};
      });
      const hasData=groups.some(group=>group.hasData);
      const records=groups.flatMap(group=>group.records).sort(ordered);
      const hasHistory=groups.some(group=>group.allGameRecordCount);
      const status=!included?'excluded':!groups.length?'pending':!hasData?'no_records':!hasHistory?'game_not_seen':!validRange?'invalid_range':!records.length?'no_matches_in_range':'matched';
      return {id,name,included,status,hasData,groups,records,dates:datesOf(records),totalRecords:records.length};
    });
    const dates=datesOf(allHistory),records=vendors.flatMap(item=>item.records).sort(ordered);
    return {game:gameName,start,end,vendor:selectedVendor,validRange,firstDate:dates.at(-1)||null,latestDate:dates[0]||null,records,totalRecords:records.length,totalVendorsWithMatches:vendors.filter(item=>item.totalRecords>0).length,vendors};
  }
  function publicEvidenceUrl(path) {
    if (path == null || path === '') return '';
    if (typeof path !== 'string' || !/^evidence\/\d{8}\/[a-f0-9]{20}\.(?:jpeg|jpg|png)$/.test(path)) throw new Error('Invalid screenshot evidence path');
    return 'https://watch.cohub.team/' + path;
  }
  function masterCsv(rows) {
    const cols=[['vendor_name','厂商'],['edition_name','系统范围'],['sample_date','日期'],['platform','平台'],['page','页面'],['slot_id','资源位ID'],['slot_name','资源位名称'],['priority','位置级别'],['object_name','游戏或应用'],['headline','主标题'],['copy','文案'],['owner_category','归属分类'],['owner_company','发行／运营方'],['owner_operator','公开主体'],['owner_status','归属状态'],['owner_sources','归属依据'],['observed_at','记录时间'],['screenshot','展示截图'],['record_id','记录ID']];
    const labels={tencent:'腾讯',other:'其他厂商',unknown:'待核实',topic:'平台活动／专题'};
    const quote=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    const lines=rows.map(r=>({...r,screenshot:publicEvidenceUrl(r.screenshot),priority:r.priority==='focus'?'重点':'其他',owner_category:labels[bucketFor(r)],owner_company:r.ownership?.company||labels[bucketFor(r)],owner_operator:r.ownership?.operator||'',owner_status:r.ownership?.status==='confirmed'?'已确认':bucketFor(r)==='topic'?'非产品':'待核实',owner_sources:(r.ownership?.sources||[]).map(s=>s.url).join(' | ')}));
    return '\uFEFF'+[cols.map(c=>quote(c[1])).join(','),...lines.map(r=>cols.map(c=>quote(r[c[0]])).join(','))].join('\r\n');
  }
  root.ResourceWatchModel = {selectDataset,contentKey, compareSnapshots, datePresentation, selectionAfterUpdate,BUCKETS,calendarDays,dateRange,bucketFor,matchesContentType,uniqueRows,dailySlot,aggregate,insights,dailyReport,queryRecords,gameHistory,masterCsv};
})(globalThis);

/* URL state is shared by the page and tests; no account or device data is stored. */
(function (root) {
  'use strict';
  const choices = {
    view:['summary','overview','daily','query'], p:['all','gamecenter','appgallery'],
    priority:['all','focus','other'], contentType:['all','game','app'],
    range:['latest','today','7','30','90','all','custom'],
    owner:['all','tencent','other','unknown','topic']
  };
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value||'') &&
    Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function readViewState(href,defaults,datasets=[]) {
    const u=new URL(href),q=u.searchParams,state={...defaults,slotDates:{}};
    const scope=q.get('scope');
    if(datasets.some(d=>d.visible&&d.id===scope))state.dataset=scope;
    const hash=u.hash.slice(1)==='master'?'query':u.hash.slice(1);
    if(choices.view.includes(hash))state.view=hash;
    for(const [field,param] of [['p','platform'],['priority','priority'],['contentType','content'],['range','range'],['owner','owner']]){
      if(choices[field].includes(q.get(param)))state[field]=q.get(param);
    }
    for(const [field,param] of [['start','from'],['end','to'],['day','day']])if(date(q.get(param)))state[field]=q.get(param);
    state.query=(q.get('q')||'').slice(0,500);
    const page=Number(q.get('page'));
    state.page=Number.isSafeInteger(page)&&page>0?Math.min(page,1000000):1;
    state.onlyChanges=q.get('changes')==='1';
    state.pinDay=q.get('fixed')==='1';
    return state;
  }
  function viewUrl(href,state) {
    const u=new URL(href);u.search='';
    const q=u.searchParams;
    if(state.dataset)q.set('scope',state.dataset);
    for(const [field,param] of [['p','platform'],['priority','priority'],['contentType','content'],['range','range'],['owner','owner']]){
      if(choices[field].includes(state[field]))q.set(param,state[field]);
    }
    if(state.range==='custom'){
      if(date(state.start))q.set('from',state.start);
      if(date(state.end))q.set('to',state.end);
    }
    if(date(state.day))q.set('day',state.day);
    if(state.query)q.set('q',state.query.slice(0,500));
    if(Number.isSafeInteger(state.page)&&state.page>1)q.set('page',String(state.page));
    if(state.onlyChanges)q.set('changes','1');
    if(state.pinDay)q.set('fixed','1');
    u.hash=choices.view.includes(state.view)?state.view:'overview';
    return u.href;
  }
  Object.assign(root.ResourceWatchModel,{readViewState,viewUrl});
})(globalThis);
