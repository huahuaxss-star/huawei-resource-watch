/* Exact-game drilldown. Native dialog preserves the underlying view and filters. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const PAGE_SIZE=20;
 let active=null;
 function screenshot(value){return /^evidence\/\d{8}\/[a-f0-9]{20}\.(jpe?g|png)$/.test(value||'')?value:'';}
 function recordTime(value){return Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)):'';}
 const messages={pending:'待接入',no_records:'暂无已发布记录',game_not_seen:'已有记录中未查到此游戏',no_matches_in_range:'所选日期内未查到此游戏',invalid_range:'开始日期不能晚于结束日期。'};
 function vendorsWithData(vendors){return (vendors||[]).filter(v=>v.status!=='pending'&&v.status!=='no_records');}
 function renderGroup(group){
  if(group.status!=='matched')return '<section class="game-history-scope is-empty"><div class="game-history-scope-heading"><h4>'+esc(group.label)+'</h4><span>'+esc(messages[group.status]||'暂无匹配记录')+'</span></div></section>';
  const limit=active.limits[group.datasetId]||PAGE_SIZE,rows=group.records.slice(0,limit);
  return '<section class="game-history-scope"><div class="game-history-scope-heading"><h4>'+esc(group.label)+'</h4><span>'+group.records.length+' 条展示 · '+group.dates.length+' 个记录日 · '+group.uniqueSlots+' 个位置</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="'+esc(group.label)+'展示记录"><table class="data-table game-history-table"><colgroup><col class="col-date"><col class="col-slot"><col class="col-copy"><col class="col-action"></colgroup><thead><tr><th scope="col">日期</th><th scope="col">平台 / 资源位</th><th scope="col">展示文案</th><th scope="col">画面</th></tr></thead><tbody>'+rows.map(row=>{
   const image=screenshot(row.screenshot);
   return '<tr><td class="nowrap">'+esc(row.sample_date)+'<small title="记录时间 · 北京时间">'+esc(recordTime(row.observed_at))+'</small></td><td>'+esc(row.slot_name||row.slot_id)+'<small>'+esc(row.platform||row.app_key)+'</small></td><td>'+esc(row.headline||row.copy||'—')+'</td><td>'+(image?'<a href="'+esc(image)+'" target="_blank" rel="noopener">查看截图 ↗</a>':'<span class="game-history-muted">暂无截图</span>')+'</td></tr>';
  }).join('')+'</tbody></table></div>'+(rows.length<group.records.length?'<div class="game-history-more"><span>已显示 '+rows.length+' / '+group.records.length+' 条</span><button type="button" class="text-action" data-game-more="'+esc(group.datasetId)+'">再显示 '+Math.min(PAGE_SIZE,group.records.length-rows.length)+' 条</button></div>':'')+'</section>';
 }
 function render(){
  if(!active)return;
  const result=root.ResourceWatchModel.gameHistory(active.data,active.filters);
  $('game-history-title').textContent=active.filters.game;
  $('game-history-context').textContent=result.firstDate?'该游戏已有记录：'+result.firstDate+' — '+result.latestDate+'':'尚无该游戏的已发布展示记录。';
  const listed=vendorsWithData(result.vendors);
  const vendorSelect=$('game-history-vendor');
  const wanted=listed.some(v=>v.id===active.filters.vendor)?active.filters.vendor:'all';
  if(wanted!==active.filters.vendor)active.filters.vendor=wanted;
  vendorSelect.innerHTML='<option value="all">全部厂商</option>'+listed.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+'</option>').join('');
  vendorSelect.value=wanted;
  $('game-history-from').value=active.filters.start||'';
  $('game-history-to').value=active.filters.end||'';
  const status=$('game-history-status');
  status.classList.toggle('is-error',!result.validRange);
  status.textContent=!result.validRange?'开始日期不能晚于结束日期，请调整后查看。':result.totalRecords?'找到 '+result.totalRecords+' 条展示记录，涉及 '+result.totalVendorsWithMatches+' 家厂商。':'当前条件下没有匹配记录。';
  $('game-history-results').innerHTML=result.validRange?vendorsWithData(result.vendors).filter(v=>v.included).map(v=>'<section class="game-history-vendor" data-history-vendor="'+esc(v.id)+'"><div class="game-history-vendor-heading"><h3>'+esc(v.name)+'</h3><span>'+(v.status==='matched'?v.totalRecords+' 条展示':esc(messages[v.status]||'暂无匹配记录'))+'</span></div>'+v.groups.filter(g=>g.status!=='pending'&&g.status!=='no_records').map(renderGroup).join('')+'</section>').join(''):'';
 }
 function open({data,game,trigger}={}){
  if(!data||!String(game||'').trim())return;
  active={data,trigger,filters:{game:String(game).trim(),vendor:'all',start:'',end:''},limits:{}};
  render();
  const dialog=$('game-history-dialog');
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
  $('close-game-history').focus({preventScroll:true});
 }
 function init(){
  if(!root.document?.getElementById)return;
  const dialog=$('game-history-dialog');if(!dialog)return;
  $('close-game-history').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{const trigger=active?.trigger;if(trigger?.isConnected)trigger.focus({preventScroll:true});});
  $('game-history-filters').addEventListener('submit',event=>event.preventDefault());
  for(const [id,key] of [['game-history-vendor','vendor'],['game-history-from','start'],['game-history-to','end']])$(id).addEventListener('change',event=>{
   if(!active)return;active.filters[key]=event.target.value;active.limits={};render();
  });
  $('game-history-reset').addEventListener('click',()=>{if(active){active.filters={...active.filters,vendor:'all',start:'',end:''};active.limits={};render();}});
  $('game-history-results').addEventListener('click',event=>{
   const more=event.target.closest('[data-game-more]');if(!more||!active)return;
   const id=more.dataset.gameMore,y=dialog.scrollTop;
   active.limits[id]=(active.limits[id]||PAGE_SIZE)+PAGE_SIZE;render();dialog.scrollTop=y;
  });
 }
 root.ResourceWatchGameHistory={open,vendorsWithData};
 init();
})(globalThis);
