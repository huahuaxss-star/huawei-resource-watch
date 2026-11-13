/* Resource ownership overview. Keeps the Claude V2 visual language and evidence flow. */
(function(){
'use strict';
let DATA=window.RESOURCE_WATCH_DATA;
const M=window.ResourceWatchModel, $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL={tencent:'腾讯',other:'其他厂商',unknown:'待核实',topic:'平台活动／专题'};
const PLAT={gamecenter:'游戏中心',appgallery:'应用市场'};
const percent=n=>n===null||n===undefined?'—':(n*100).toFixed(1)+'%';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hm=t=>(t||'').slice(11,16);
const name=r=>r.object_name||r.headline||'未识别内容';
const url=u=>/^https:\/\//.test(u||'')?u:'#';
const shot=u=>/^evidence\/\d{8}\/[a-f0-9]{20}\.(jpe?g|png)$/.test(u||'')?u:'';
if(!DATA?.snapshots?.length){document.querySelector('main').innerHTML='<p class="empty-state">还没有已核对的采样记录。</p>';return;}
let state={p:'all',priority:'all',range:'7',start:DATA.snapshots[0].date,end:today(),query:'',page:1};
let currentView,filteredRows=[],refreshing=false,lastRenderToday='';
function range(){return M.dateRange(state.range,today(),DATA.snapshots[0].date,state.start,state.end);}
function links(sources){return (sources||[]).map((s,i)=>'<a href="'+esc(url(s.url))+'" target="_blank" rel="noopener">'+esc(s.title||'官方依据')+(sources.length>1?' '+(i+1):'')+' ↗</a>').join(' · ');}
function bar(shares,klass=''){return '<div class="sharebar '+klass+'" role="img" aria-label="'+M.BUCKETS.map(k=>LABEL[k]+' '+percent(shares[k])).join('，')+'">'+M.BUCKETS.filter(k=>shares[k]>0).map(k=>'<span class="share-'+k+'" style="width:'+shares[k]*100+'%" title="'+LABEL[k]+' '+percent(shares[k])+'"></span>').join('')+'</div>';}
function numbers(shares){return '<div class="share-numbers">'+M.BUCKETS.filter(k=>k==='tencent'||k==='other'||shares[k]>0).map(k=>'<span class="'+k+'-text">'+LABEL[k]+' <b>'+percent(shares[k])+'</b></span>').join('')+'</div>';}
function evidence(r){const o=r.ownership||{},src=shot(r.screenshot);return '<details class="more" data-key="ev-'+esc(r.sample_date+'-'+r.record_id)+'"><summary>原文与截图</summary><div class="ev'+(src?'':' noimg')+'"><dl class="kv">'+[
 ['页面模块',r.module],['产品',r.object_name],['主标题',r.headline],['文案',r.copy],['补充文案',r.app_copy],['活动时间',r.period_text],['页面名次',r.rank],['公开主体',o.operator],['归属备注',o.note],['采样时间',r.observed_at]
 ].filter(x=>x[1]).map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>').join('')+(o.sources?.length?'<dt>归属依据</dt><dd>'+links(o.sources)+'</dd>':'')+'</dl>'+(src?'<a class="shot" href="'+esc(src)+'" target="_blank" rel="noopener"><img src="'+esc(src)+'" loading="lazy" alt="'+esc(r.platform+' '+r.slot_name+' '+r.sample_date+'截图')+'"><span>查看完整截图 ↗</span></a>':'')+'</div></details>';}
function product(r){const b=M.bucketFor(r),o=r.ownership||{};return '<article class="daily-product"><div><strong>'+esc(name(r))+'</strong><span class="owner-badge '+b+'-text">'+esc(o.company||LABEL[b])+'</span></div>'+(r.object_name&&r.headline?'<p>'+esc(r.headline)+'</p>':'')+evidence(r)+'</article>';}
function slotHistory(s){if(!s.sampleDays)return '<p class="empty-state">这个位置在所选范围没有采样，无法计算占比。</p>';
return '<div class="slot-history"><div class="history-intro"><p>各发行／运营方的区间占比</p><div class="company-shares">'+s.companies.map(c=>'<span>'+esc(c.name)+' <b>'+percent(c.share)+'</b></span>').join('')+'</div><p class="method-inline">'+s.sampleDays+' 个有效采样日；腾讯在其中 '+s.tencentDays+' 天出现。以下按日期展开，截图保留原始页面。</p></div>'+s.days.slice().reverse().map(d=>'<div class="day-row"><div class="day-label"><b>'+d.date+'</b><span>'+d.count+' 条内容 · 腾讯 '+percent(d.shares.tencent)+'</span></div><div class="day-products">'+d.rows.map(product).join('')+'</div></div>').join('')+'</div>';}
function placement(s){const slot=s.slot,missing=!s.sampleDays;return '<details class="placement '+(slot.app==='gamecenter'?'gc':'ag')+'" id="slot-'+esc(slot.id)+'"><summary><div class="place-name"><span class="priority-tag">'+(slot.priority==='focus'?'重点':'其他')+'</span><b>'+esc(slot.name)+'</b><small>'+esc(slot.kind)+'</small></div><div class="place-shares">'+(missing?'<span class="empty-line">未采样</span>':bar(s.shares)+numbers(s.shares))+'</div><div class="place-coverage"><b>'+s.sampleDays+' 天</b><small>'+s.records+' 条内容</small></div><span class="open-label">每日明细 <span class="ar">›</span></span></summary>'+slotHistory(s)+'</details>';}
function renderPlacements(V){$('placement-groups').innerHTML=Object.keys(PLAT).filter(p=>state.p==='all'||state.p===p).map(p=>{const ss=V.summaries.filter(s=>s.slot.app===p);return '<div class="placement-group '+(p==='gamecenter'?'gc':'ag')+'"><h3 class="ptag">'+PLAT[p]+'<small>'+ss.filter(s=>s.sampleDays).length+' / '+ss.length+' 个位置有样本</small></h3><div class="placement-list">'+ss.map(placement).join('')+'</div></div>';}).join('');}
function renderHero(V){const latest=DATA.snapshots.at(-1).date;
$('hero-eyebrow').textContent=(state.p==='all'?'华为游戏中心 · 应用市场':'华为'+PLAT[state.p])+' / 每日资源观察';
$('hero-lead').textContent='按位置追踪腾讯与其他发行运营方的内容占比，保留每天的产品、原文与截图。';
$('hero-share').textContent=percent(V.shares.tencent);
$('hero-composition').innerHTML=V.slotDays?bar(V.shares)+numbers(V.shares):'<p>所选范围暂无样本</p>';
const stat=(n,t)=>'<div class="stat"><b>'+n+'</b><span>'+t+'</span></div>';
$('stats').innerHTML=stat(V.observedSlots,'个位置有样本')+stat(V.dates.length,'个有效采样日')+stat(V.rows.length,'条去重内容');
$('range-note').textContent=V.validRange?V.start+' — '+V.end+' · 所选 '+V.calendarDays+' 天，'+V.dates.length+' 天有样本 · 监控始于 '+DATA.snapshots[0].date:'开始日期不能晚于结束日期。';
const note=latest!==today()?'最新采样为 '+latest+'；今天尚无已核对记录。页面不会将旧数据当作今天。':'';
$('stale').hidden=!note;$('stale').textContent=note;
}
function renderInsights(V){$('insights').innerHTML=M.insights(V).map((x,i)=>'<article><span class="insight-index">0'+(i+1)+'</span><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.text)+'</p></div></article>').join('');
$('quality-note').textContent=!V.slotDays?'区间内没有样本，暂不能判断归属覆盖情况。':V.unknownProducts.length?'归属待核实：'+V.unknownProducts.join('、')+'。这些内容已进入分母，并单列“待核实”，不会默认为其他厂商。':'所选范围的产品归属均已有核对依据。';
$('timeline').innerHTML=V.timeline.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>日期</th><th>已采位置</th><th>腾讯</th><th>其他厂商</th><th>待核实</th><th>活动／专题</th></tr></thead><tbody>'+V.timeline.slice().reverse().map(d=>'<tr><td>'+d.date+'</td><td>'+d.slots+'</td>'+M.BUCKETS.map(k=>'<td>'+percent(d.shares[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="method-inline">逐日整体值按当日已采位置等权。覆盖位置不同，整体占比不能直接视为投放趋势。</p>':'<p>暂无有效采样日。</p>';
}
function renderMaster(){const q=state.query.trim().toLocaleLowerCase();filteredRows=currentView.rows.filter(r=>!q||[r.object_name,r.headline,r.slot_name,r.platform,r.ownership?.company,r.ownership?.operator].join(' ').toLocaleLowerCase().includes(q));
const size=25,total=Math.max(1,Math.ceil(filteredRows.length/size));state.page=Math.min(Math.max(1,state.page),total);const rows=filteredRows.slice((state.page-1)*size,state.page*size);
$('master-count').textContent=filteredRows.length+' 条记录'+(q?' · 含关键词筛选':'');$('export-range').disabled=!filteredRows.length;
$('master-table').innerHTML=rows.length?'<table class="data-table master-table"><thead><tr><th>日期</th><th>平台／资源位</th><th>产品／内容</th><th>发行／运营方</th><th>归属</th><th>证据</th></tr></thead><tbody>'+rows.map(r=>'<tr><td class="nowrap">'+r.sample_date+'<small>'+hm(r.observed_at)+'</small></td><td>'+esc(r.platform)+'<small>'+esc(r.slot_name)+'</small></td><td>'+esc(name(r))+(r.object_name&&r.headline?'<small>'+esc(r.headline)+'</small>':'')+'</td><td>'+esc(r.ownership?.company||'待核实')+'</td><td class="'+M.bucketFor(r)+'-text">'+LABEL[M.bucketFor(r)]+'</td><td>'+(shot(r.screenshot)?'<a href="'+esc(r.screenshot)+'" target="_blank" rel="noopener">截图 ↗</a>':'—')+'<a href="#slot-'+esc(r.slot_id)+'" class="detail-link">位置明细</a></td></tr>').join('')+'</tbody></table>':'<p class="empty-state">没有匹配记录，请调整筛选。</p>';
$('pagination').innerHTML=filteredRows.length?'<button type="button" data-page="'+(state.page-1)+'" '+(state.page===1?'disabled':'')+'>上一页</button><span>'+state.page+' / '+total+' 页</span><button type="button" data-page="'+(state.page+1)+'" '+(state.page===total?'disabled':'')+'>下一页</button>':'';
}
function renderFooter(){ $('ownership-policy').textContent=DATA.ownership_policy;$('automation-status').textContent=DATA.sampling.automation_status+'。'+DATA.sampling.requirements+'。网页每分钟检查是否已有新发布数据。';
$('naming').innerHTML='<table><thead><tr><th>平台</th><th>观察名称</th><th>页面原标题</th><th>级别</th></tr></thead><tbody>'+DATA.slots.map(s=>'<tr><td>'+esc(s.platform)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.aliases.join('、'))+'</td><td>'+(s.priority==='focus'?'重点':'其他')+'</td></tr>').join('')+'</tbody></table>';
const owners=new Map();DATA.snapshots.forEach(s=>s.records.filter(r=>r.object_name).forEach(r=>owners.set(r.object_name,r.ownership)));
$('ownership-table').innerHTML='<table><thead><tr><th>产品</th><th>发行／运营方</th><th>公开主体</th><th>依据与核对日期</th></tr></thead><tbody>'+[...owners].sort((a,b)=>a[0].localeCompare(b[0],'zh-CN')).map(([n,o])=>'<tr><td>'+esc(n)+'</td><td>'+esc(o?.company||'待核实')+'</td><td>'+esc(o?.operator||'—')+'</td><td>'+links(o?.sources)+'<small>'+esc(o?.verified_on||'尚待核对')+'</small></td></tr>').join('')+'</tbody></table>';
$('meta').textContent='最新采样 '+DATA.snapshots.at(-1).date+' · '+DATA.snapshots.length+' 个历史采样日 · 北京时间';
}
function openHash(){if(!location.hash.startsWith('#slot-'))return;const el=document.getElementById(location.hash.slice(1));if(el){el.open=true;el.scrollIntoView({block:'start'});}}
function render({preserve=false}={}){const opened=preserve?[...document.querySelectorAll('details[open]')].map(e=>e.id||e.dataset.key):[];const y=window.scrollY;
lastRenderToday=today();currentView=M.aggregate(DATA,{...range(),platform:state.p,priority:state.priority});renderHero(currentView);renderPlacements(currentView);renderInsights(currentView);renderMaster();renderFooter();
if(preserve){document.querySelectorAll('details').forEach(e=>{if(opened.includes(e.id||e.dataset.key))e.open=true;});window.scrollTo(0,y);}else openHash();}
$('date-from').value=state.start;$('date-to').value=state.end;$('date-from').max=today();$('date-to').max=today();
document.querySelectorAll('[data-p]').forEach(b=>b.addEventListener('click',()=>{state.p=b.dataset.p;state.page=1;document.querySelectorAll('[data-p]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
document.querySelectorAll('[data-pr]').forEach(b=>b.addEventListener('click',()=>{state.priority=b.dataset.pr;state.page=1;document.querySelectorAll('[data-pr]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
$('range-select').addEventListener('change',e=>{state.range=e.target.value;state.page=1;$('custom-dates').hidden=state.range!=='custom';render();});
$('filters').addEventListener('submit',e=>{e.preventDefault();state.start=$('date-from').value;state.end=$('date-to').value;state.page=1;render();});
$('search').addEventListener('input',e=>{state.query=e.target.value;state.page=1;renderMaster();});
$('pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b&&!b.disabled){state.page=Number(b.dataset.page);renderMaster();}});
$('export-range').addEventListener('click',()=>{const blob=new Blob([M.masterCsv(filteredRows)],{type:'text/csv;charset=utf-8;'});const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='华为资源位_'+currentView.start+'_'+currentView.end+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);});
window.addEventListener('hashchange',openHash);
async function refresh(){if(refreshing||document.hidden)return;refreshing=true;try{const response=await fetch('data/manifest.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error('manifest');const manifest=await response.json();if(manifest.version!==DATA.version){const r=await fetch('data/site.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('data');const next=await r.json();if(next.version!==manifest.version||next.schema_version!==1||!Array.isArray(next.slots)||!next.snapshots?.length||next.snapshots.some(s=>!Array.isArray(s.records)||!Array.isArray(s.covered_slots)))throw new Error('invalid update');DATA=next;render({preserve:true});$('meta').textContent+=' · 数据已更新';}else if(lastRenderToday!==today()){render({preserve:true});$('date-from').max=today();$('date-to').max=today();}else renderHero(currentView);}catch{$('meta').textContent='自动更新暂未成功，当前记录仍可查看。';}finally{refreshing=false;}}
render();if(/^https?:$/.test(location.protocol)){setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});}
})();
