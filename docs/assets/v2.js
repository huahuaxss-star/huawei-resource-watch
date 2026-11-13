/* Three browsing views; historical detail is rendered only when requested. */
(function(){
'use strict';
let DATA=window.RESOURCE_WATCH_DATA;
const M=window.ResourceWatchModel,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL={tencent:'腾讯',other:'其他厂商',unknown:'待核实',topic:'平台活动／专题'};
const PLAT={gamecenter:'游戏中心',appgallery:'应用市场'};
const STATUS={seen:'新出现',changed:'内容有变化',not_seen:'本次未见',same:'与上次相同'};
const percent=n=>n==null?'—':(n*100).toFixed(1)+'%';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const name=r=>r.object_name||r.headline||'未识别内容';
const hm=t=>(t||'').slice(11,16);
const url=u=>/^https:\/\//.test(u||'')?u:'#';
const shot=u=>/^evidence\/\d{8}\/[a-f0-9]{20}\.(jpe?g|png)$/.test(u||'')?u:'';
if(!DATA?.snapshots?.length){document.querySelector('main').innerHTML='<p class="empty-state">还没有已核对的采样记录。</p>';return;}
const latest=()=>DATA.snapshots.at(-1).date;
let state={view:'overview',p:'all',priority:'all',range:'latest',start:DATA.snapshots[0].date,end:today(),day:latest(),query:'',owner:'all',page:1,onlyChanges:false,slotDates:{}};
let currentView,dayReport,filteredRows=[],refreshing=false,lastRenderToday='';
const filters=()=>({platform:state.p,priority:state.priority});
function range(){return state.range==='latest'?{start:latest(),end:latest()}:M.dateRange(state.range,today(),DATA.snapshots[0].date,state.start,state.end);}
function links(sources){return(sources||[]).map((s,i)=>'<a href="'+esc(url(s.url))+'" target="_blank" rel="noopener">'+esc(s.title||'官方依据')+(sources.length>1?' '+(i+1):'')+' ↗</a>').join(' · ');}
function bar(shares){return '<div class="sharebar" role="img" aria-label="'+M.BUCKETS.map(k=>LABEL[k]+' '+percent(shares[k])).join('，')+'">'+M.BUCKETS.filter(k=>shares[k]>0).map(k=>'<span class="share-'+k+'" style="width:'+shares[k]*100+'%"></span>').join('')+'</div>';}
function numbers(shares){return '<div class="share-numbers">'+M.BUCKETS.filter(k=>k==='tencent'||k==='other'||shares[k]>0).map(k=>'<span class="'+k+'-text">'+LABEL[k]+' <b>'+percent(shares[k])+'</b></span>').join('')+'</div>';}
function evidence(r,open=false){const o=r.ownership||{},src=shot(r.screenshot);return '<details class="more" '+(open?'open':'')+'><summary>原文与截图</summary><div class="ev'+(src?'':' noimg')+'"><dl class="kv">'+[
 ['页面模块',r.module],['产品',r.object_name],['主标题',r.headline],['文案',r.copy],['补充文案',r.app_copy],['活动时间',r.period_text],['页面名次',r.rank],['公开主体',o.operator],['归属备注',o.note],['采样时间',r.observed_at]
 ].filter(x=>x[1]).map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>').join('')+(o.sources?.length?'<dt>归属依据</dt><dd>'+links(o.sources)+'</dd>':'')+'</dl>'+(src?'<a class="shot" href="'+esc(src)+'" target="_blank" rel="noopener"><img src="'+esc(src)+'" loading="lazy" alt="'+esc(r.platform+' '+r.slot_name+' '+r.sample_date+'截图')+'"><span>查看完整截图 ↗</span></a>':'')+'</div></details>';}
function product(r,status){return '<article class="daily-product"><div><strong>'+esc(name(r))+'</strong><span class="owner-badge '+M.bucketFor(r)+'-text">'+esc(r.ownership?.company||LABEL[M.bucketFor(r)])+'</span>'+(status&&status!=='same'?'<span class="change-label '+status+'">'+STATUS[status]+'</span>':'')+'</div>'+(r.object_name&&r.headline?'<p>'+esc(r.headline)+'</p>':'')+evidence(r)+'</article>';}
function placement(s,mode='overview'){
 const slot=s.slot,missing=!s.sampleDays,isDay=mode==='daily';
 const change=isDay&&dayReport.ready?(dayReport.comparableSlots.includes(slot.id)?(dayReport.changedSlots.includes(slot.id)?'有变化':'与上次相同'):'未参与比较'):'';
 return '<details class="placement '+(slot.app==='gamecenter'?'gc':'ag')+'" id="'+(isDay?'day-slot-':'slot-')+esc(slot.id)+'" data-slot="'+esc(slot.id)+'" data-mode="'+mode+'"><summary><div class="place-name"><span class="priority-tag">'+(slot.priority==='focus'?'重点':'其他')+'</span><b>'+esc(slot.name)+'</b><small>'+esc(isDay?(missing?'当天未采到':s.days[0].rows.map(name).join(' · ')):slot.kind)+'</small></div><div class="place-shares">'+(missing?'<span class="empty-line">未采样</span>':bar(s.shares)+numbers(s.shares))+'</div><div class="place-coverage"><b>'+(isDay?s.records+' 条':s.sampleDays+' 天')+'</b><small>'+esc(isDay?change:s.records+' 条内容')+'</small></div><span class="open-label">'+(isDay?'查看内容':'按日查看')+' <span class="ar">›</span></span></summary><div class="slot-body"></div></details>';
}
function groups(summaries,mode){return Object.keys(PLAT).filter(p=>state.p==='all'||state.p===p).map(p=>{const ss=summaries.filter(s=>s.slot.app===p);if(!ss.length)return '';return '<div class="placement-group '+(p==='gamecenter'?'gc':'ag')+'"><h3 class="ptag">'+PLAT[p]+'<small>'+ss.filter(s=>s.sampleDays).length+' / '+ss.length+' 个位置有样本</small></h3><div class="placement-list">'+ss.map(s=>placement(s,mode)).join('')+'</div></div>';}).join('');}
function fillSlot(el){
 const isDay=el.dataset.mode==='daily',s=(isDay?dayReport.view:currentView).summaries.find(s=>s.slot.id===el.dataset.slot),body=el.querySelector('.slot-body');
 if(!s||!s.sampleDays){body.innerHTML='<p class="empty-state">这个位置没有已核对样本，不能计算占比。</p>';return;}
 const wanted=isDay?state.day:state.slotDates[s.slot.id],day=s.days.find(d=>d.date===wanted)||s.days.at(-1);
 const stats=isDay?'':'<div class="history-intro"><p>所选区间的发行／运营方占比</p><div class="company-shares">'+s.companies.map(c=>'<span>'+esc(c.name)+' <b>'+percent(c.share)+'</b></span>').join('')+'</div><p class="method-inline">'+s.sampleDays+' 个有效采样日；腾讯在 '+s.tencentDays+' 天出现。以下仅展示所选的一天。</p></div>';
 const dates=isDay?'':'<label class="history-date">查看这一天<select data-slot-date="'+esc(s.slot.id)+'" aria-label="'+esc(s.slot.name)+'查看日期">'+s.days.slice().reverse().map(d=>'<option value="'+d.date+'" '+(d.date===day.date?'selected':'')+'>'+d.date+'</option>').join('')+'</select></label>';
 const statusFor=r=>isDay?dayReport.items.find(x=>x.status!=='not_seen'&&M.contentKey(x.row)===M.contentKey(r))?.status:null;
 const missing=isDay?dayReport.items.filter(x=>x.status==='not_seen'&&x.row.slot_id===s.slot.id):[];
 body.innerHTML='<div class="slot-history">'+stats+dates+'<div class="day-row"><div class="day-label"><b>'+day.date+'</b><span>'+day.count+' 条内容 · 腾讯 '+percent(day.shares.tencent)+'</span></div><div class="day-products">'+day.rows.map(r=>product(r,statusFor(r))).join('')+(missing.length?'<p class="not-seen">本次未见：'+missing.map(x=>esc(name(x.row))).join('、')+'。仅与 '+dayReport.previousDate+' 的同一位置比较，不代表下架。</p>':'')+'</div></div></div>';
}
function renderHero(V){
 $('hero-eyebrow').textContent=(state.p==='all'?'华为游戏中心 · 应用市场':'华为'+PLAT[state.p])+' / 每日资源观察';
 $('hero-lead').textContent='总览看占比，每日看变化，原文与截图按需查阅。';
 $('hero-share').textContent=percent(V.shares.tencent);
 $('hero-composition').innerHTML=V.slotDays?bar(V.shares)+numbers(V.shares):'<p>所选范围暂无样本</p>';
 const stat=(n,t)=>'<div class="stat"><b>'+n+'</b><span>'+t+'</span></div>';
 $('stats').innerHTML=stat(V.observedSlots,'个位置有样本')+stat(V.dates.length,'个有效采样日')+stat(V.rows.length,'条去重内容');
 $('range-note').textContent=state.view==='daily'?'每日记录按单日查看；平台和位置级别筛选仍然有效。':V.validRange?V.start+' — '+V.end+' · 所选 '+V.calendarDays+' 天，'+V.dates.length+' 天有样本 · 监控始于 '+DATA.snapshots[0].date:'开始日期不能晚于结束日期。';
 const note=latest()!==today()?'最新采样为 '+latest()+'；今天尚无已核对记录。':'';
 $('stale').hidden=!note;$('stale').textContent=note;
}
function renderInsights(V){
 const insights=M.insights(V);
 if(state.range==='latest'){
  const d=M.dailyReport(DATA,latest(),filters());
  if(d.previousDate){insights.splice(-1,1,{title:'与上一次采样比较',text:d.ready?d.previousDate+' → '+d.date+'，共同覆盖 '+d.comparableSlots.length+' 个位置：'+d.changedSlots.length+' 个位置有变化；新出现 '+d.counts.seen+' 条、内容变化 '+d.counts.changed+' 条、本次未见 '+d.counts.not_seen+' 条。'+(d.routeChanged?'采样路线有变化，需谨慎比较。':''):'两次没有共同覆盖的位置，暂不能比较。'});}
 }
 $('insights').innerHTML=insights.map((x,i)=>'<article><span class="insight-index">0'+(i+1)+'</span><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.text)+'</p></div></article>').join('');
 $('quality-note').textContent=!V.slotDays?'区间内没有样本，暂不能判断归属覆盖情况。':V.unknownProducts.length?'归属待核实：'+V.unknownProducts.join('、')+'。这些内容计入分母，并单列“待核实”。':'所选范围的产品归属均已有核对依据。';
 $('timeline').innerHTML='';if($('trend-details').open)renderTimeline();
}
function renderTimeline(){const V=currentView;const days=V.timeline.slice(-30).reverse();$('timeline').innerHTML=days.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>日期</th><th>已采位置</th><th>腾讯</th><th>其他厂商</th><th>待核实</th><th>活动／专题</th></tr></thead><tbody>'+days.map(d=>'<tr><td><button class="text-action" data-open-day="'+d.date+'">'+d.date+'</button></td><td>'+d.slots+'</td>'+M.BUCKETS.map(k=>'<td>'+percent(d.shares[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="method-inline">'+(V.timeline.length>30?'展示区间内最近 30 个采样日；更早日期可在每日记录中选择。':'')+'逐日占比按当天已采位置等权；覆盖不同时不能直接视为投放趋势。</p>':'<p>暂无有效采样日。</p>';}
function renderDaily(){
 const dates=DATA.snapshots.map(s=>s.date);if(!dates.includes(state.day))state.day=dates.at(-1);
 dayReport=M.dailyReport(DATA,state.day,filters());const D=dayReport,V=D.view,i=dates.indexOf(state.day);
 $('daily-date').innerHTML=dates.slice().reverse().map(d=>'<option value="'+d+'" '+(d===state.day?'selected':'')+'>'+d+(d===latest()?' · 最近一次':'')+'</option>').join('');
 $('previous-day').disabled=i<=0;$('next-day').disabled=i>=dates.length-1;$('latest-day').disabled=state.day===latest();
 $('daily-date-note').textContent=(state.day!==today()?'正在查看 '+state.day+' 的历史样本；':'')+'共有 '+dates.length+' 个已采样日期，未采样日不补 0。';
 const stat=(n,t)=>'<div><b>'+n+'</b><span>'+t+'</span></div>';
 $('daily-stats').innerHTML=stat(V.observedSlots+' / '+V.expectedSlots,'已采位置')+stat(V.rows.length,'条去重内容')+stat(percent(V.shares.tencent),'腾讯内容占比')+stat(D.ready?D.changedSlots.length:'—','有变化的位置');
 $('daily-comparison').innerHTML=D.ready?'<b>'+D.previousDate+' → '+D.date+'</b><span>共同覆盖 '+D.comparableSlots.length+' 个位置 · 新出现 '+D.counts.seen+' 条 · 内容变化 '+D.counts.changed+' 条 · 本次未见 '+D.counts.not_seen+' 条</span><small>'+((D.unmatchedSlots.length?D.unmatchedSlots.length+' 个位置缺少共同样本，未参加比较。':'')+(D.routeChanged?'采样路线不同，需谨慎比较。':'')+'“本次未见”不等于下架；未采到不视为无变化。')+'</small>':'<b>'+(D.previousDate?'暂无可比较的位置':'首日基线，暂不判断变化')+'</b><span>'+(D.previousDate?'与 '+D.previousDate+' 没有共同覆盖的位置。':'至少两次不同日期且采到相同位置后，才会显示变化。')+'</span>';
 $('only-changes').disabled=!D.ready;if(!D.ready)state.onlyChanges=false;$('only-changes').checked=state.onlyChanges;
 const ss=V.summaries.filter(s=>!state.onlyChanges||D.changedSlots.includes(s.slot.id));
 $('daily-placements').innerHTML=ss.length?groups(ss,'daily'):'<p class="empty-state">共同采到的位置中，没有观察到内容变化。</p>';
 $('export-day').disabled=!V.rows.length;
}
function renderMaster(){
 const result=M.queryRecords(currentView.rows,{query:state.query,owner:state.owner,page:state.page});
 filteredRows=result.filtered;state.page=result.page;
 $('master-count').textContent=result.total+' 条匹配记录';$('export-range').disabled=!result.total;
 $('master-table').innerHTML=result.rows.length?'<table class="data-table master-table"><thead><tr><th>日期</th><th>平台／资源位</th><th>产品／内容</th><th>发行／运营方</th><th>归属</th><th>原始记录</th></tr></thead><tbody>'+result.rows.map((r,i)=>'<tr><td class="nowrap">'+r.sample_date+'<small>'+hm(r.observed_at)+'</small></td><td>'+esc(r.platform)+'<small>'+esc(r.slot_name)+'</small></td><td>'+esc(name(r))+(r.object_name&&r.headline?'<small>'+esc(r.headline)+'</small>':'')+'</td><td>'+esc(r.ownership?.company||'待核实')+'</td><td class="'+M.bucketFor(r)+'-text">'+LABEL[M.bucketFor(r)]+'</td><td><button class="text-action" data-record-index="'+((result.page-1)*result.size+i)+'">查看记录</button></td></tr>').join('')+'</tbody></table>':'<p class="empty-state">没有匹配记录，请调整日期、归属或关键词。</p>';
 $('pagination').innerHTML=result.total?'<span>每页 '+result.size+' 条</span><button type="button" data-page="'+(result.page-1)+'" '+(result.page===1?'disabled':'')+'>上一页</button><span>'+result.page+' / '+result.pages+' 页</span><button type="button" data-page="'+(result.page+1)+'" '+(result.page===result.pages?'disabled':'')+'>下一页</button>'+(result.pages>2?'<label>跳到<input type="number" id="page-jump" min="1" max="'+result.pages+'" value="'+result.page+'" aria-label="跳转页码">页</label><button type="button" data-page-go>跳转</button>':''):'';
}
function renderFooter(){
 $('ownership-policy').textContent=DATA.ownership_policy;
 $('automation-status').textContent=DATA.sampling.automation_status+'。'+DATA.sampling.requirements+'。网页会自动检查已发布的数据更新。';
 $('meta').textContent='最新采样 '+latest()+' · '+DATA.snapshots.length+' 个历史采样日 · 北京时间';
}
function fillReference(id){
 if(id==='naming-details')$('naming').innerHTML='<table><thead><tr><th>平台</th><th>观察名称</th><th>页面原标题</th><th>级别</th></tr></thead><tbody>'+DATA.slots.map(s=>'<tr><td>'+esc(s.platform)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.aliases.join('、'))+'</td><td>'+(s.priority==='focus'?'重点':'其他')+'</td></tr>').join('')+'</tbody></table>';
 if(id==='ownership-details'){const owners=new Map();DATA.snapshots.forEach(s=>s.records.filter(r=>r.object_name).forEach(r=>owners.set(r.object_name,r.ownership)));$('ownership-table').innerHTML='<p class="method-inline">此处为各产品最近一次记录中的归属；历史归属以对应日期的原始记录为准。</p><table><thead><tr><th>产品</th><th>发行／运营方</th><th>公开主体</th><th>依据与核对日期</th></tr></thead><tbody>'+[...owners].sort((a,b)=>a[0].localeCompare(b[0],'zh-CN')).map(([n,o])=>'<tr><td>'+esc(n)+'</td><td>'+esc(o?.company||'待核实')+'</td><td>'+esc(o?.operator||'—')+'</td><td>'+links(o?.sources)+'<small>'+esc(o?.verified_on||'尚待核对')+'</small></td></tr>').join('')+'</tbody></table>';}
}
function render({preserve=false}={}){
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
 if(preserve){open.forEach(id=>{const e=$(id);if(e)e.open=true;});window.scrollTo(0,y);}
}
function activateView(view,{scroll=true}={}){if(!['overview','daily','query'].includes(view))return;state.view=view;history.replaceState(null,'','#'+view);render();if(scroll)window.scrollTo({top:0,behavior:'instant'});}
function route(){const h=location.hash.slice(1);if(h.startsWith('slot-')){state.view='overview';render();const e=$(h);if(e){e.open=true;e.scrollIntoView({block:'start'});}return;}activateView(h==='master'?'query':['overview','daily','query'].includes(h)?h:'overview',{scroll:false});}
function download(rows,filename){const blob=new Blob([M.masterCsv(rows)],{type:'text/csv;charset=utf-8;'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
function openRecord(index){const r=filteredRows[index];if(!r)return;$('record-dialog-title').textContent=name(r);$('record-dialog-content').innerHTML='<p class="record-context">'+r.sample_date+' · '+esc(r.platform)+' · '+esc(r.slot_name)+'</p><p>'+esc(r.ownership?.company||'待核实')+' · '+LABEL[M.bucketFor(r)]+'</p>'+evidence(r,true);$('record-dialog').showModal();}
$('date-from').value=state.start;$('date-to').value=state.end;$('date-from').max=today();$('date-to').max=today();
document.querySelectorAll('[data-p]').forEach(b=>b.addEventListener('click',()=>{state.p=b.dataset.p;state.page=1;document.querySelectorAll('[data-p]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
document.querySelectorAll('[data-pr]').forEach(b=>b.addEventListener('click',()=>{state.priority=b.dataset.pr;state.page=1;document.querySelectorAll('[data-pr]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
$('range-select').addEventListener('change',e=>{state.range=e.target.value;state.page=1;render();});
$('filters').addEventListener('submit',e=>{e.preventDefault();state.start=$('date-from').value;state.end=$('date-to').value;state.page=1;render();});
$('daily-date').addEventListener('change',e=>{state.day=e.target.value;state.onlyChanges=false;renderDaily();});
for(const [id,delta]of[['previous-day',-1],['next-day',1]])$(id).addEventListener('click',()=>{const dates=DATA.snapshots.map(s=>s.date),next=dates[dates.indexOf(state.day)+delta];if(next){state.day=next;state.onlyChanges=false;renderDaily();}});
$('latest-day').addEventListener('click',()=>{state.day=latest();state.onlyChanges=false;renderDaily();});
$('only-changes').addEventListener('change',e=>{state.onlyChanges=e.target.checked;renderDaily();});
$('search').addEventListener('input',e=>{state.query=e.target.value;state.page=1;renderMaster();});
$('owner-filter').addEventListener('change',e=>{state.owner=e.target.value;state.page=1;renderMaster();});
$('export-range').addEventListener('click',()=>download(filteredRows,'华为资源位_查询_'+currentView.start+'_'+currentView.end+'.csv'));
$('export-day').addEventListener('click',()=>download(dayReport.view.rows,'华为资源位_'+state.day+'.csv'));
$('close-record').addEventListener('click',()=>$('record-dialog').close());
document.addEventListener('toggle',e=>{if(!e.target.open)return;if(e.target.matches('.placement'))fillSlot(e.target);else if(e.target.id==='trend-details')renderTimeline();else fillReference(e.target.id);},true);
document.addEventListener('change',e=>{if(e.target.matches('[data-slot-date]')){state.slotDates[e.target.dataset.slotDate]=e.target.value;fillSlot(e.target.closest('.placement'));}});
document.addEventListener('click',e=>{
 const view=e.target.closest('[data-view]');if(view){e.preventDefault();activateView(view.dataset.view);return;}
 const page=e.target.closest('[data-page]');if(page&&!page.disabled){state.page=Number(page.dataset.page);renderMaster();return;}
 if(e.target.closest('[data-page-go]')){state.page=Number($('page-jump').value);renderMaster();return;}
 const record=e.target.closest('[data-record-index]');if(record){openRecord(Number(record.dataset.recordIndex));return;}
 const day=e.target.closest('[data-open-day]');if(day){state.day=day.dataset.openDay;activateView('daily');}
});
window.addEventListener('hashchange',route);
async function refresh(){if(refreshing||document.hidden)return;refreshing=true;try{
 const response=await fetch('data/manifest.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error('manifest');const manifest=await response.json();
 if(manifest.version!==DATA.version){const r=await fetch('data/site.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('data');const next=await r.json();if(next.version!==manifest.version||next.schema_version!==1||!Array.isArray(next.slots)||!next.snapshots?.length||next.snapshots.some(s=>!Array.isArray(s.records)||!Array.isArray(s.covered_slots)))throw new Error('invalid update');const follow=state.day===latest();DATA=next;if(follow)state.day=latest();render({preserve:true});$('meta').textContent+=' · 数据已更新';}
 else if(lastRenderToday!==today()){render({preserve:true});$('date-from').max=today();$('date-to').max=today();}
 }catch{$('meta').textContent='自动更新暂未成功，当前记录仍可查看。';}finally{refreshing=false;}}
route();if(/^https?:$/.test(location.protocol)){setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});}
})();
