/* Vendor summary and three dataset views; historical detail is rendered on demand. */
(function(){
'use strict';
let ALL_DATA=window.RESOURCE_WATCH_DATA,DATA;
const M=window.ResourceWatchModel,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL={tencent:'腾讯',other:'其他厂商',unknown:'待核实',topic:'平台活动／专题'};
const PLAT={gamecenter:'游戏中心',appgallery:'应用市场'};
const VENDORS=[['huawei','华为'],['oppo','OPPO'],['vivo','vivo'],['xiaomi','小米'],['honor','荣耀']];
const STATUS={seen:'新出现',changed:'内容有变化',not_seen:'本次未见',same:'与上次相同'};
const percent=n=>n==null?'—':(n*100).toFixed(1)+'%';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const name=r=>r.object_name||r.headline||'未识别内容';
const isGame=r=>Boolean(r.object_name)&&r.ownership?.product_type==='game';
const gameName=r=>isGame(r)?'<button type="button" class="game-history-link" data-game-name="'+esc(r.object_name)+'" title="查看各厂商历史展示">'+esc(r.object_name)+'</button>':esc(name(r));
const hm=t=>Number.isFinite(Date.parse(t))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(t)):'';
const url=u=>/^https:\/\//.test(u||'')?u:'#';
const shot=u=>/^evidence\/\d{8}\/[a-f0-9]{20}\.(jpe?g|png)$/.test(u||'')?u:'';
const registry=()=>ALL_DATA.datasets||[DATA?.dataset];
const vendorOf=d=>d.vendor||d.id.split('-')[0];
const isDual=d=>d.edition==='dual'||d.edition_name==='双框';
const hasScopeRecords=id=>(ALL_DATA.snapshots||[]).some(s=>(s.dataset_id||'huawei-single')===id&&s.records?.length);
const scopeListed=d=>d&&d.visible!==false&&!(isDual(d)&&!hasScopeRecords(d.id));
if(!ALL_DATA?.snapshots){document.querySelector('main').innerHTML='<p class="empty-state">暂无已发布数据，更新后可在这里查看。</p>';return;}
const requestedScope=new URLSearchParams(location.search).get('scope');
const fallbackScope=(ALL_DATA.datasets||[]).find(scopeListed);
const initialScope=ALL_DATA.datasets?.some(d=>scopeListed(d)&&d.id===requestedScope)?requestedScope:(scopeListed((ALL_DATA.datasets||[]).find(d=>d.id===ALL_DATA.default_dataset))?ALL_DATA.default_dataset||'huawei-single':(fallbackScope?.id||ALL_DATA.default_dataset||'huawei-single'));
DATA=M.selectDataset(ALL_DATA,initialScope);
const latest=()=>DATA.snapshots.at(-1)?.date||null;
const firstDate=()=>DATA.snapshots[0]?.date||today();
const defaults=()=>({dataset:initialScope,view:'summary',p:'all',priority:'all',contentType:'all',range:'latest',start:firstDate(),end:today(),day:latest(),query:'',owner:'all',page:1,onlyChanges:false,pinDay:false,slotDates:{}});
let state=M.readViewState(location.href,defaults(),ALL_DATA.datasets);
let currentView,dayReport,filteredRows=[],refreshing=false,lastRenderToday='';
const filters=()=>({platform:state.p,priority:state.priority,contentType:state.contentType});
const contentLabel=()=>({all:'全部内容',game:'游戏',app:'应用'}[state.contentType]);
const shareLabel=()=>'腾讯资源占比';
const shareTone=share=>share===0?' is-zero':share===1?' is-full':'';
const scopeCaption=()=>contentLabel()+' · '+(state.range==='latest'?'最新日期':state.range==='today'?'今天':state.range==='all'?'全部记录':state.range==='custom'?(state.start&&state.end?state.start+' — '+state.end:'自选日期'):'最近 '+state.range+' 天');
function renderScopes(){
 const currentVendor=vendorOf(DATA.dataset),vendors=new Map(VENDORS);
 registry().forEach(d=>vendors.set(vendorOf(d),d.vendor_name||vendors.get(vendorOf(d))||d.label));
 if($('vendor-tabs'))$('vendor-tabs').innerHTML=[...vendors].map(([id,label])=>{
  const available=registry().some(d=>scopeListed(d)&&vendorOf(d)===id),selected=currentVendor===id;
  return '<button type="button" data-vendor="'+esc(id)+'" aria-pressed="'+selected+'"'+(available?'':' disabled aria-label="'+esc(label+'，待接入')+'"')+'><span>'+esc(label)+'</span>'+(available?'':'<small>待接入</small>')+'</button>';
 }).join('');
 const scopes=registry().filter(d=>scopeListed(d)&&vendorOf(d)===currentVendor);
 $('dataset-select').innerHTML=scopes.map(d=>'<option value="'+esc(d.id)+'" '+(d.id===state.dataset?'selected':'')+'>'+esc(d.edition_name||d.label)+'</option>').join('');
 const datasetLabel=$('dataset-select').closest('label');if(datasetLabel)datasetLabel.hidden=scopes.length<2;
}
function renderPageHeading(){
 const headings={summary:'厂商汇总',overview:'资源总览',daily:'每日动态',query:'历史查询'};
 const title=headings[state.view];
 if($('page-title'))$('page-title').textContent=title;
 const priority=$('priority-controls'),destination=$(state.view+'-priority-slot');
 if(priority&&destination&&priority.parentElement!==destination)destination.appendChild(priority);
}
function syncUrl(){const next=M.viewUrl(location.href,state);if(next!==location.href)history.replaceState(null,'',next);}
function syncControls(){
 $('content-type').value=state.contentType;$('range-select').value=state.range;
 const latestOption=$('range-select').querySelector('option[value="latest"]');
 if(latestOption)latestOption.textContent=latest()?'最新 · '+latest().slice(5):'最新数据';
 $('date-from').value=state.start;$('date-to').value=state.end;
 $('search').value=state.query;$('owner-filter').value=state.owner;
 if($('platform-select'))$('platform-select').value=state.p;
 document.querySelectorAll('[data-p]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p===state.p)));
 document.querySelectorAll('[data-pr]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pr===state.priority)));
}
function updateStatus(){
 if(state.view==='summary'){
  const knownVendors=new Set(VENDORS.map(v=>v[0]));
  const scopes=registry().filter(d=>d.visible&&knownVendors.has(vendorOf(d))),byId=new Map(scopes.map(d=>[d.id,d]));
  const snapshots=ALL_DATA.snapshots.filter(s=>byId.has(s.dataset_id||'huawei-single')&&s.records?.length);
  const stamp=snapshots.map(s=>s.completed_at||s.date).filter(t=>Number.isFinite(Date.parse(t))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
  const displayTime=stamp?.includes('T')?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp)):stamp;
  $('scope-status').textContent=displayTime?'最近更新 '+displayTime+' · 北京时间':'暂无已发布数据';
  $('update-mode').textContent=displayTime?'按需更新 · 已核对':'有新记录后更新';
  $('stale').hidden=true;return;
 }
 const last=DATA.snapshots.at(-1),stamp=last?.completed_at;
 const displayTime=Number.isFinite(Date.parse(stamp))?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp)):last?.date;
 $('scope-status').textContent=last?'数据截至 '+displayTime+' · 北京时间':'暂无已发布数据';
 $('update-mode').textContent=last?(DATA.sampling?.update_mode==='on_demand'?'按需更新 · 已核对':'已核对'):'有新记录后更新';
}
function range(){return state.range==='latest'?{start:latest(),end:latest()}:M.dateRange(state.range,today(),firstDate(),state.start,state.end);}
function links(sources){return(sources||[]).map((s,i)=>'<a href="'+esc(url(s.url))+'" target="_blank" rel="noopener">'+esc(s.title||'官方依据')+(sources.length>1?' '+(i+1):'')+' ↗</a>').join(' · ');}
function bar(shares){return '<div class="sharebar'+shareTone(shares.tencent)+'" role="img" aria-label="'+M.BUCKETS.map(k=>LABEL[k]+' '+percent(shares[k])).join('，')+'">'+M.BUCKETS.filter(k=>shares[k]>0).map(k=>'<span class="share-'+k+'" style="width:'+shares[k]*100+'%"></span>').join('')+'</div>';}
function numbers(shares){return '<div class="share-numbers">'+M.BUCKETS.filter(k=>k==='tencent'||k==='other'||shares[k]>0).map(k=>'<span class="'+k+'-text">'+LABEL[k]+' <b class="'+shareTone(shares[k]).trim()+'">'+percent(shares[k])+'</b></span>').join('')+'</div>';}
function evidence(r,open=false){const o=r.ownership||{},src=shot(r.screenshot);return '<details class="more" '+(open?'open':'')+'><summary>详情与截图</summary><div class="ev'+(src?'':' noimg')+'"><dl class="kv">'+[
 ['页面模块',r.module],['产品',r.object_name],['主标题',r.headline],['文案',r.copy],['补充文案',r.app_copy],['活动时间',r.period_text],['页面名次',r.rank],['公开主体',o.operator],['归属备注',o.note],['记录时间',r.observed_at]
 ].filter(x=>x[1]).map(([k,v])=>'<dt>'+k+'</dt><dd>'+(k==='产品'?gameName(r):esc(v))+'</dd>').join('')+(o.sources?.length?'<dt>归属依据</dt><dd>'+links(o.sources)+'</dd>':'')+'</dl>'+(src?'<a class="shot" href="'+esc(src)+'" target="_blank" rel="noopener"><img src="'+esc(src)+'" loading="lazy" alt="'+esc(r.platform+' '+r.slot_name+' '+r.sample_date+'截图')+'"><span>查看完整截图 ↗</span></a>':'')+'</div></details>';}
function product(r,status){return '<article class="daily-product"><div><strong>'+gameName(r)+'</strong><span class="owner-badge '+M.bucketFor(r)+'-text">'+esc(r.ownership?.company||LABEL[M.bucketFor(r)])+'</span>'+(status&&status!=='same'?'<span class="change-label '+status+'">'+STATUS[status]+'</span>':'')+'</div>'+(r.object_name&&r.headline?'<p>'+esc(r.headline)+'</p>':'')+evidence(r)+'</article>';}
function placement(s,mode='overview'){
 const slot=s.slot,missing=!s.sampleDays,isDay=mode==='daily';
 const change=isDay&&dayReport.ready?(dayReport.comparableSlots.includes(slot.id)?(dayReport.changedSlots.includes(slot.id)?'有变化':'与上次相同'):'未参与比较'):'';
 if(!isDay){
  const rows=s.days.flatMap(d=>d.rows),products=[...new Map(rows.map(r=>[name(r),r])).values()],unit=rows.every(r=>r.object_name)?'款':'项';
  const summary=products.slice(0,2).map(gameName).join('、')+(products.length>2?' 等 '+products.length+' '+unit:'');
  const singleDate=currentView.start===currentView.end;
  const context=missing?(singleDate?'当天暂无内容':'期间暂无内容'):singleDate?currentView.start:'有记录 '+s.sampleDays+' 天';
  const share=missing?'<span class="empty-line">—</span>':'<span class="placement-percent'+shareTone(s.shares.tencent)+'">'+percent(s.shares.tencent)+'</span><span class="mini-sharebar'+shareTone(s.shares.tencent)+'" role="img" aria-label="腾讯资源占比 '+percent(s.shares.tencent)+'"><span class="share-tencent" style="width:'+s.shares.tencent*100+'%"></span></span>';
  return '<details class="placement overview-placement" id="slot-'+esc(slot.id)+'" data-slot="'+esc(slot.id)+'" data-mode="overview"><summary><div class="place-name"><span class="place-title">'+esc(slot.name)+'</span><small>'+esc(slot.platform||PLAT[slot.app]||slot.app)+'</small></div><div class="place-products"><span>'+(summary||'暂无记录')+'</span><small>'+esc(context)+'</small></div><div class="place-shares">'+share+'</div><span class="open-label">查看内容 <span class="ar">›</span></span></summary><div class="slot-body"></div></details>';
 }
 return '<details class="placement '+(slot.app==='gamecenter'?'gc':'ag')+'" id="'+(isDay?'day-slot-':'slot-')+esc(slot.id)+'" data-slot="'+esc(slot.id)+'" data-mode="'+mode+'"><summary><div class="place-name"><span class="priority-tag">'+(slot.priority==='focus'?'重点':'其他')+'</span><b>'+esc(slot.name)+'</b><small>'+(isDay?(missing?'当天暂无记录':s.days[0].rows.map(gameName).join(' · ')):esc(slot.kind))+'</small></div><div class="place-shares">'+(missing?'<span class="empty-line">暂无记录</span>':bar(s.shares)+numbers(s.shares))+'</div><div class="place-coverage"><b>'+(isDay?s.records+' 条':s.sampleDays+' 天')+'</b><small>'+esc(isDay?change:s.records+' 条内容')+'</small></div><span class="open-label">'+(isDay?'查看内容':'按日查看')+' <span class="ar">›</span></span></summary><div class="slot-body"></div></details>';
}
function groups(summaries,mode){
 const empty='<p class="empty-state">当前范围没有匹配内容，请调整日期、平台或内容范围。</p>';
 if(mode==='overview'){
  const ss=summaries.filter(s=>(state.p==='all'||state.p===s.slot.app)&&(state.contentType==='all'||s.sampleDays));
  return ss.length?'<div class="placement-table"><div class="placement-table-head" aria-hidden="true"><span>资源位置</span><span>'+(currentView.start===currentView.end?'展示内容':'期间出现内容')+'</span><span>腾讯资源占比</span><span></span></div><div class="placement-list">'+ss.map(s=>placement(s,mode)).join('')+'</div></div>':empty;
 }
 return Object.keys(PLAT).filter(p=>state.p==='all'||state.p===p).map(p=>{const ss=summaries.filter(s=>s.slot.app===p&&(state.contentType==='all'||s.sampleDays));if(!ss.length)return '';return '<div class="placement-group '+(p==='gamecenter'?'gc':'ag')+'"><h3 class="ptag">'+PLAT[p]+'<small>'+(state.contentType==='all'?ss.filter(s=>s.sampleDays).length+' / '+ss.length+' 个资源位':ss.length+' 个位置有'+contentLabel()+'内容')+'</small></h3><div class="placement-list">'+ss.map(s=>placement(s,mode)).join('')+'</div></div>';}).join('')||empty;
}
function fillSlot(el){
 const isDay=el.dataset.mode==='daily',s=(isDay?dayReport.view:currentView).summaries.find(s=>s.slot.id===el.dataset.slot),body=el.querySelector('.slot-body');
 if(!s||!s.sampleDays){body.innerHTML='<p class="empty-state">这个位置暂无已发布数据。</p>';return;}
 const wanted=isDay?state.day:state.slotDates[s.slot.id],day=s.days.find(d=>d.date===wanted)||s.days.at(-1);
 const stats=isDay?'':'<div class="history-intro"><p>所选区间的发行／运营方占比</p><div class="company-shares">'+s.companies.map(c=>'<span>'+esc(c.name)+' <b>'+percent(c.share)+'</b></span>').join('')+'</div><p class="method-inline">'+s.sampleDays+' 天有记录；腾讯在 '+s.tencentDays+' 天出现。</p></div>';
 const dates=isDay?'':'<label class="history-date"><span class="label-with-note">查看这一天</span><select data-slot-date="'+esc(s.slot.id)+'" aria-label="'+esc(s.slot.name)+'查看日期">'+s.days.slice().reverse().map(d=>'<option value="'+d.date+'" '+(d.date===day.date?'selected':'')+'>'+d.date+'</option>').join('')+'</select></label>';
 const statusFor=r=>isDay?dayReport.items.find(x=>x.status!=='not_seen'&&M.contentKey(x.row)===M.contentKey(r))?.status:null;
 const missing=isDay?dayReport.items.filter(x=>x.status==='not_seen'&&x.row.slot_id===s.slot.id):[];
 body.innerHTML='<div class="slot-history">'+stats+dates+'<div class="day-row"><div class="day-label"><b>'+day.date+'</b><span>'+day.count+' 条内容 · 腾讯资源占比 '+percent(day.shares.tencent)+'</span></div><div class="day-products">'+day.rows.map(r=>product(r,statusFor(r))).join('')+(missing.length?'<div class="not-seen">本次未见：'+missing.map(x=>gameName(x.row)).join('、')+'。</div>':'')+'</div></div></div>';
}
function renderHero(V){
 $('share-kicker').textContent=shareLabel();
 $('hero-share').textContent=percent(V.shares.tencent);
 $('hero-composition').innerHTML=V.slotDays?bar(V.shares)+numbers(V.shares):'<p>所选范围暂无数据</p>';
 const stat=(label,n,unit)=>'<div class="stat"><span class="stat-label">'+label+'</span><span class="stat-value">'+n+'</span><span class="stat-unit">'+unit+'</span></div>';
 $('stats').innerHTML=stat(state.contentType==='all'?'展示位置':'匹配资源位',V.observedSlots,'个位置')+stat('展示'+(state.contentType==='all'?'产品':contentLabel()),new Set(V.rows.map(r=>r.object_name).filter(Boolean)).size,'款'+(state.contentType==='all'?'产品':contentLabel()));
 if($('hero-scope'))$('hero-scope').textContent='口径：'+scopeCaption();
 $('range-note').textContent=state.view==='daily'?'':V.validRange?(V.start===V.end?V.end:V.start+' — '+V.end)+' · '+V.dates.length+' 个记录日':'开始日期不能晚于结束日期。';
 const note=latest()&&latest()!==today()?'今天暂无更新':'';
 $('stale').hidden=!note;$('stale').textContent=note;
}
function renderInsights(V){
 const insights=M.insights(V);
 if(state.range==='latest'){
  const d=M.dailyReport(DATA,latest(),filters());
  if(d.previousDate&&V.slotDays){insights.splice(-1,1,{title:'近期资源变化',text:d.ready?d.previousDate+' → '+d.date+'，共同覆盖 '+d.comparableSlots.length+' 个位置：'+d.changedSlots.length+' 个位置有变化；新出现 '+d.counts.seen+' 条、内容变化 '+d.counts.changed+' 条、本次未见 '+d.counts.not_seen+' 条。'+(d.routeChanged?'页面范围不同，比较仅限共同位置。':''):'两次没有共同覆盖的位置，暂不能比较。'});}
 }
 $('quality-note').hidden=!V.unknownProducts.length;
 $('insights').innerHTML=insights.map((x,i)=>'<article><span class="insight-index">0'+(i+1)+'</span><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.text)+'</p></div></article>').join('');
 $('quality-note').textContent=!V.slotDays?'':V.unknownProducts.length?'归属待确认：'+V.unknownProducts.join('、')+'。':'';
 $('trend-details').hidden=V.dates.length<3;$('timeline').innerHTML='';if($('trend-details').open)renderTimeline();
}
function renderTimeline(){const V=currentView;const days=V.timeline.slice(-30).reverse();$('timeline').innerHTML=days.length?'<div class="table-scroll"><table class="data-table timeline-table"><colgroup><col class="col-date"><col span="5"></colgroup><thead><tr><th>日期</th><th>展示位置</th><th>腾讯</th><th>其他厂商</th><th>待核实</th><th>活动／专题</th></tr></thead><tbody>'+days.map(d=>'<tr><td><button class="text-action" data-open-day="'+d.date+'">'+d.date+'</button></td><td>'+d.slots+'</td>'+M.BUCKETS.map(k=>'<td>'+percent(d.shares[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<p>暂无数据。</p>';}
function renderDaily(){
 const dates=DATA.snapshots.map(s=>s.date);if(!dates.includes(state.day))state.day=dates.at(-1);
 dayReport=M.dailyReport(DATA,state.day,filters());const D=dayReport,V=D.view,i=dates.indexOf(state.day);
 $('daily-date').innerHTML=dates.slice().reverse().map(d=>'<option value="'+d+'" '+(d===state.day?'selected':'')+'>'+d+'</option>').join('');
 $('previous-day').disabled=i<=0;$('next-day').disabled=i>=dates.length-1;$('latest-day').disabled=state.day===latest();
 $('daily-date-note').textContent=dates.length<2?((state.day!==today()?'历史记录 · ':'')+'目前只有 1 个记录日'):((state.day!==today()?'历史记录 · ':'')+dates.length+' 个记录日可查询');
 const stat=(n,t)=>'<div><span>'+t+'</span><b>'+n+'</b></div>';
 $('daily-stats').innerHTML=stat(state.contentType==='all'?V.observedSlots+' / '+V.expectedSlots:V.observedSlots,state.contentType==='all'?'展示位置':'匹配资源位')+stat(V.rows.length,state.contentType==='all'?'展示记录':contentLabel()+'记录')+stat(percent(V.shares.tencent),shareLabel())+(D.ready?stat(D.changedSlots.length,'有变化的位置'):'');
 $('daily-comparison').hidden=dates.length<2;$('daily-comparison').classList.toggle('is-empty',!D.ready);
 $('daily-comparison').innerHTML=dates.length<2?'':D.ready?'<b>'+D.previousDate+' → '+D.date+'</b><span>共同覆盖 '+D.comparableSlots.length+' 个位置 · 新出现 '+D.counts.seen+' 条 · 内容变化 '+D.counts.changed+' 条 · 本次未见 '+D.counts.not_seen+' 条</span><small>'+((D.unmatchedSlots.length?D.unmatchedSlots.length+' 个位置没有可比较的记录。':'')+(D.routeChanged?'页面范围不同，比较仅限共同位置。':''))+'</small>':'<b>'+(D.previousDate?'暂无可比较的位置':'暂无对比数据')+'</b><span>'+(D.previousDate?'与 '+D.previousDate+' 没有共同覆盖的位置。':'当前日期暂无更早记录。')+'</span>';
 $('only-changes').closest('label').hidden=!D.ready||dates.length<2;
 document.querySelector('.day-toolbar').hidden=dates.length<2;
 $('only-changes').disabled=!D.ready;if(!D.ready)state.onlyChanges=false;$('only-changes').checked=state.onlyChanges;
 const ss=V.summaries.filter(s=>!state.onlyChanges||D.changedSlots.includes(s.slot.id));
 $('daily-placements').innerHTML=ss.length?groups(ss,'daily'):'<p class="empty-state">共同采到的位置中，没有观察到内容变化。</p>';
 $('export-day').disabled=!V.rows.length;
 syncUrl();
}
function renderMaster(){
 const result=M.queryRecords(currentView.rows,{query:state.query,owner:state.owner,page:state.page});
 filteredRows=result.filtered;state.page=result.page;
 $('master-count').textContent=result.total+' 条匹配记录';$('export-range').disabled=!result.total;
 $('master-table').innerHTML=result.rows.length?'<table class="data-table master-table"><colgroup><col class="col-date"><col class="col-slot"><col class="col-product"><col class="col-owner"><col class="col-bucket"><col class="col-action"></colgroup><thead><tr><th>日期</th><th>平台／资源位</th><th>产品／内容</th><th>发行／运营方</th><th>归属</th><th>展示详情</th></tr></thead><tbody>'+result.rows.map((r,i)=>'<tr><td class="nowrap" data-label="日期"><span>'+r.sample_date+'<small>'+hm(r.observed_at)+'</small></span></td><td data-label="平台／资源位"><span>'+esc(r.platform)+'<small>'+esc(r.slot_name)+'</small></span></td><td data-label="产品／内容"><span>'+gameName(r)+(r.object_name&&r.headline?'<small>'+esc(r.headline)+'</small>':'')+'</span></td><td data-label="发行／运营方"><span>'+esc(r.ownership?.company||'待核实')+'</span></td><td class="'+M.bucketFor(r)+'-text" data-label="归属"><span>'+LABEL[M.bucketFor(r)]+'</span></td><td data-label="展示详情"><span><button class="text-action" data-record-index="'+((result.page-1)*result.size+i)+'">查看记录</button></span></td></tr>').join('')+'</tbody></table>':'<p class="empty-state">没有匹配记录，请调整日期、归属或关键词。</p>';
 $('pagination').innerHTML=result.total?'<span>每页 '+result.size+' 条</span><button type="button" data-page="'+(result.page-1)+'" '+(result.page===1?'disabled':'')+'>上一页</button><span>'+result.page+' / '+result.pages+' 页</span><button type="button" data-page="'+(result.page+1)+'" '+(result.page===result.pages?'disabled':'')+'>下一页</button>'+(result.pages>2?'<label>跳到<input type="number" id="page-jump" min="1" max="'+result.pages+'" value="'+result.page+'" aria-label="跳转页码">页</label><button type="button" data-page-go>跳转</button>':''):'';
 syncUrl();
}
function renderFooter(){
 $('ownership-details').hidden=state.view==='summary';
 if(state.view==='summary'){$('footer-info').hidden=!ALL_DATA.snapshots.length;$('meta').textContent='五厂商汇总 · 各厂商独立统计 · 北京时间';return;}
 $('footer-info').hidden=!DATA.snapshots.length;
 $('meta').textContent=DATA.dataset.label+(latest()?' · 数据截至 '+latest()+' · 北京时间':' · 暂无已发布数据');
}

function fillReference(id){
 if(id==='naming-details')$('naming').innerHTML='<table><thead><tr><th>平台</th><th>观察名称</th><th>页面原标题</th><th>级别</th></tr></thead><tbody>'+DATA.slots.map(s=>'<tr><td>'+esc(s.platform)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.aliases.join('、'))+'</td><td>'+(s.priority==='focus'?'重点':'其他')+'</td></tr>').join('')+'</tbody></table>';
 if(id==='ownership-details'){const owners=new Map();DATA.snapshots.forEach(s=>s.records.filter(r=>r.object_name).forEach(r=>owners.set(r.object_name,r.ownership)));$('ownership-table').innerHTML='<table><thead><tr><th>产品</th><th>发行／运营方</th><th>公开主体</th><th>依据与核对日期</th></tr></thead><tbody>'+[...owners].sort((a,b)=>a[0].localeCompare(b[0],'zh-CN')).map(([n,o])=>'<tr><td>'+esc(n)+'</td><td>'+esc(o?.company||'待核实')+'</td><td>'+esc(o?.operator||'—')+'</td><td>'+links(o?.sources)+'<small>'+esc(o?.verified_on||'尚待核对')+'</small></td></tr>').join('')+'</tbody></table>';}
}
function render({preserve=false}={}){
 document.body.dataset.activeView=state.view;
 renderScopes();renderPageHeading();
 syncControls();updateStatus();
 const hasData=DATA.snapshots.length>0;
 $('daily-date-field').hidden=state.view!=='daily'||!hasData;
 const isSummary=state.view==='summary';
 if($('summary-panel'))$('summary-panel').hidden=!isSummary;
 if($('vendor-tabs'))$('vendor-tabs').hidden=isSummary;
 const filterDock=document.getElementById('filter-dock');if(filterDock)filterDock.hidden=isSummary;
 const rangeContext=document.querySelector('.range-context');if(rangeContext)rangeContext.hidden=!hasData||state.view==='daily'||isSummary;
 document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===state.view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(isSummary){
  lastRenderToday=today();currentView=null;dayReport=null;filteredRows=[];
  ['dataset-empty','filters','hero','overview-panel','daily-panel','query-panel','range-note','stale'].forEach(id=>$(id).hidden=true);
  window.ResourceWatchSummary?.render?.({data:ALL_DATA,onOpenDataset:openSummaryDataset});
  renderFooter();syncUrl();return;
 }
 $('dataset-empty').hidden=hasData;$('dataset-empty-title').textContent=DATA.dataset.label;
 $('filters').hidden=!hasData;
 if(!hasData){currentView=null;dayReport=null;filteredRows=[];state.day=null;state.page=1;state.onlyChanges=false;['hero','overview-panel','daily-panel','query-panel','range-note','stale'].forEach(id=>$(id).hidden=true);['placement-groups','daily-placements','master-table','pagination','ownership-table'].forEach(id=>$(id).innerHTML='');renderFooter();syncUrl();return;}
 $('range-note').hidden=state.view==='daily';
 const open=preserve?[...document.querySelectorAll('.placement[open]')].map(e=>e.id):[],y=window.scrollY;
 lastRenderToday=today();currentView=M.aggregate(DATA,{...range(),...filters()});
 $('hero').hidden=state.view!=='overview';$('overview-panel').hidden=state.view!=='overview';$('daily-panel').hidden=state.view!=='daily';$('query-panel').hidden=state.view!=='query';
 $('range-field').hidden=state.view==='daily';$('custom-dates').hidden=state.view==='daily'||state.range!=='custom';
 document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===state.view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 renderHero(currentView);
 $('placement-groups').innerHTML=state.view==='overview'?groups(currentView.summaries,'overview'):'';
 if(state.view==='overview')renderInsights(currentView);
 if(state.view==='daily')renderDaily();else $('daily-placements').innerHTML='';
 if(state.view==='query')renderMaster();else{$('master-table').innerHTML='';$('pagination').innerHTML='';}
 renderFooter();
 syncUrl();
 if(preserve){open.forEach(id=>{const e=$(id);if(e)e.open=true;});window.scrollTo(0,y);}
}
function activateView(view,{scroll=true}={}){if(!['summary','overview','daily','query'].includes(view))return;state.view=view;render();if(scroll)window.scrollTo({top:0,behavior:'instant'});}
function route(){const h=location.hash.slice(1);state=M.readViewState(location.href,defaults(),ALL_DATA.datasets);DATA=M.selectDataset(ALL_DATA,state.dataset);render();if(h.startsWith('slot-')){const e=$(h);if(e){e.open=true;e.scrollIntoView({block:'start'});}}}
function download(rows,filename){const blob=new Blob([M.masterCsv(rows)],{type:'text/csv;charset=utf-8;'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
function openRecord(index){const r=filteredRows[index];if(!r)return;$('record-dialog-title').textContent=name(r);$('record-dialog-content').innerHTML='<p class="record-context">'+r.sample_date+' · '+esc(r.platform)+' · '+esc(r.slot_name)+'</p><p>'+esc(r.ownership?.company||'待核实')+' · '+LABEL[M.bucketFor(r)]+'</p>'+evidence(r,true);$('record-dialog').showModal();}
function changeDataset(id,{renderNow=true}={}){
 if(id===state.dataset||!registry().some(d=>scopeListed(d)&&d.id===id))return;
 state.dataset=id;DATA=M.selectDataset(ALL_DATA,state.dataset);state.day=latest();state.pinDay=false;state.page=1;state.query='';state.owner='all';state.slotDates={};state.onlyChanges=false;state.start=firstDate();state.end=today();$('record-dialog').close();if(renderNow)render();
}
function openSummaryDataset(id,context={}){
 if(!registry().some(d=>scopeListed(d)&&d.id===id))return;
 changeDataset(id,{renderNow:false});
 state.contentType=['all','game','app'].includes(context.contentType)?context.contentType:'all';
 state.p=['all',...Object.keys(PLAT)].includes(context.platform)?context.platform:'all';
 state.priority=['all','focus','other'].includes(context.priority)?context.priority:'all';
 const selected=context.range;
 if(selected&&/^\d{4}-\d{2}-\d{2}$/.test(selected.start)&&/^\d{4}-\d{2}-\d{2}$/.test(selected.end)&&M.calendarDays(selected.start,selected.end)>0){state.range='custom';state.start=selected.start;state.end=selected.end;}else state.range='latest';
 state.query='';state.owner='all';state.page=1;state.onlyChanges=false;state.slotDates={};
 activateView('overview');
}
$('dataset-select').addEventListener('change',e=>{if(registry().some(d=>scopeListed(d)&&d.id===e.target.value&&vendorOf(d)===vendorOf(DATA.dataset)))changeDataset(e.target.value);});
$('date-from').value=state.start;$('date-to').value=state.end;$('date-from').max=today();$('date-to').max=today();
$('content-type').addEventListener('change',e=>{state.contentType=e.target.value;state.page=1;state.onlyChanges=false;state.slotDates={};render();});
if($('platform-select'))$('platform-select').addEventListener('change',e=>{if(!['all',...Object.keys(PLAT)].includes(e.target.value))return;state.p=e.target.value;state.page=1;render();});
document.querySelectorAll('[data-p]').forEach(b=>b.addEventListener('click',()=>{state.p=b.dataset.p;state.page=1;document.querySelectorAll('[data-p]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
document.querySelectorAll('[data-pr]').forEach(b=>b.addEventListener('click',()=>{state.priority=b.dataset.pr;state.page=1;document.querySelectorAll('[data-pr]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
$('range-select').addEventListener('change',e=>{state.range=e.target.value;state.page=1;render();});
$('filters').addEventListener('submit',e=>{e.preventDefault();state.start=$('date-from').value;state.end=$('date-to').value;state.page=1;render();});
$('daily-date').addEventListener('change',e=>{state.day=e.target.value;state.pinDay=true;state.onlyChanges=false;renderDaily();});
for(const [id,delta]of[['previous-day',-1],['next-day',1]])$(id).addEventListener('click',()=>{const dates=DATA.snapshots.map(s=>s.date),next=dates[dates.indexOf(state.day)+delta];if(next){state.day=next;state.pinDay=true;state.onlyChanges=false;renderDaily();}});
$('latest-day').addEventListener('click',()=>{state.day=latest();state.pinDay=false;state.onlyChanges=false;renderDaily();});
$('only-changes').addEventListener('change',e=>{state.onlyChanges=e.target.checked;renderDaily();});
$('search').addEventListener('input',e=>{state.query=e.target.value;state.page=1;renderMaster();});
$('owner-filter').addEventListener('change',e=>{state.owner=e.target.value;state.page=1;renderMaster();});
$('export-range').addEventListener('click',()=>download(filteredRows,DATA.dataset.label+'_'+contentLabel()+'_查询_'+currentView.start+'_'+currentView.end+'.csv'));
$('export-day').addEventListener('click',()=>download(dayReport.view.rows,DATA.dataset.label+'_'+contentLabel()+'_'+state.day+'.csv'));
$('close-record').addEventListener('click',()=>$('record-dialog').close());
document.addEventListener('toggle',e=>{if(!e.target.open)return;if(e.target.matches('.placement'))fillSlot(e.target);else if(e.target.id==='trend-details')renderTimeline();else fillReference(e.target.id);},true);
document.addEventListener('change',e=>{if(e.target.matches('[data-slot-date]')){state.slotDates[e.target.dataset.slotDate]=e.target.value;fillSlot(e.target.closest('.placement'));}});
document.addEventListener('click',e=>{
 const game=e.target.closest('[data-game-name]');if(game){e.preventDefault();e.stopPropagation();window.ResourceWatchGameHistory?.open?.({data:ALL_DATA,game:game.dataset.gameName,trigger:game});return;}
 const vendor=e.target.closest('[data-vendor]');if(vendor){if(!vendor.disabled&&vendor.dataset.vendor!==vendorOf(DATA.dataset)){const scopes=registry().filter(d=>scopeListed(d)&&vendorOf(d)===vendor.dataset.vendor);const next=scopes.find(d=>d.id===ALL_DATA.default_dataset)||scopes[0];if(next)changeDataset(next.id);}return;}
 const view=e.target.closest('[data-view]');if(view){e.preventDefault();activateView(view.dataset.view);return;}
 const page=e.target.closest('button[data-page]');if(page&&!page.disabled){state.page=Number(page.dataset.page);renderMaster();return;}
 if(e.target.closest('button[data-page-go]')){state.page=Number($('page-jump').value);renderMaster();return;}
 const record=e.target.closest('[data-record-index]');if(record){openRecord(Number(record.dataset.recordIndex));return;}
 const day=e.target.closest('[data-open-day]');if(day){state.day=day.dataset.openDay;state.pinDay=true;activateView('daily');}
});
window.addEventListener('hashchange',route);
window.addEventListener('popstate',route);
async function refresh(){if(refreshing||document.hidden)return;refreshing=true;try{
 const response=await fetch('data/manifest.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error('manifest');const manifest=await response.json();
 if(manifest.version!==ALL_DATA.version){const r=await fetch('data/site.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('data');const next=await r.json();if(next.version!==manifest.version||next.schema_version!==1||!Array.isArray(next.slots)||!next.snapshots?.length||next.snapshots.some(s=>!Array.isArray(s.records)||!Array.isArray(s.covered_slots)))throw new Error('invalid update');const priorDates=DATA.snapshots.map(s=>s.date);ALL_DATA=next;DATA=M.selectDataset(ALL_DATA,state.dataset);state.day=M.selectionAfterUpdate(state.day,priorDates,DATA.snapshots.map(s=>s.date),{pinned:state.pinDay});render({preserve:true});$('meta').textContent+=' · 数据已更新';}
 else if(lastRenderToday!==today()){render({preserve:true});$('date-from').max=today();$('date-to').max=today();}
 }catch{$('meta').textContent='自动更新暂未成功，当前记录仍可查看。';}finally{refreshing=false;}}
const filterDock=document.getElementById('filter-dock'),filterToggle=document.getElementById('filter-toggle');
if(filterToggle&&filterDock){
  filterToggle.addEventListener('click',()=>{
    const open=filterDock.classList.toggle('is-open');
    filterToggle.setAttribute('aria-expanded',String(open));
  });
}
route();if(/^https?:$/.test(location.protocol)){setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});}
})();
