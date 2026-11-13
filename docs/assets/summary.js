/* Five-vendor overview. Aggregation stays in ResourceWatchModel. */
(function (root) {
  'use strict';
  const VENDORS = [
    {id:'huawei',name:'华为',color:'#3e6599',pointStyle:'circle'},
    {id:'oppo',name:'OPPO',color:'#16856b',pointStyle:'rectRounded'},
    {id:'vivo',name:'vivo',color:'#7d5ac8',pointStyle:'triangle'},
    {id:'xiaomi',name:'小米',color:'#c37b2b',pointStyle:'rectRot'},
    {id:'honor',name:'荣耀',color:'#667184',pointStyle:'star'},
  ];
  const FONT = 'PingFang SC, -apple-system, BlinkMacSystemFont, sans-serif';
  const CONTENT = {all:'全部内容',game:'游戏',app:'应用'};
  const RANGES = {latest:'最新日期',7:'最近 7 天',30:'最近 30 天',90:'最近 90 天',all:'全部记录'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent = value => value == null ? '—' : (value*100).toFixed(1)+'%';
  let uiState = {range:'30',contentType:'game',metric:'share',scopes:{}};
  let activeChart = null;

  function hasRecords(data,id) {
    return (data.snapshots||[]).some(s=>(s.dataset_id||'huawei-single')===id&&s.records?.length);
  }
  function calendarDates(start,end) {
    if(!start||!end||start>end)return [];
    const dates=[],day=new Date(start+'T00:00:00Z'),last=Date.parse(end+'T00:00:00Z');
    for(;day.getTime()<=last;day.setUTCDate(day.getUTCDate()+1))dates.push(day.toISOString().slice(0,10));
    return dates;
  }
  function buildView(data,requested={}) {
    const M=root.ResourceWatchModel;
    const state={
      range:Object.hasOwn(RANGES,requested.range)?String(requested.range):'30',
      contentType:Object.hasOwn(CONTENT,requested.contentType)?requested.contentType:'game',
      metric:requested.metric==='slots'?'slots':'share',scopes:{},
    };
    const registry=data.datasets||[{id:'huawei-single',vendor:'huawei',edition_name:'单框',label:'华为 · 单框',visible:true}];
    const rows=VENDORS.map(vendor=>{
      const scopes=registry.filter(d=>d.vendor===vendor.id&&d.visible!==false).map(scope=>({...scope,hasData:hasRecords(data,scope.id)}));
      const preferred=scopes.find(d=>d.id===data.default_dataset);
      const selected=scopes.find(d=>d.id===requested.scopes?.[vendor.id])||
        (preferred&&hasRecords(data,preferred.id)?preferred:null)||scopes.find(d=>hasRecords(data,d.id))||preferred||scopes[0]||null;
      if(selected)state.scopes[vendor.id]=selected.id;
      const scopeData=selected?M.selectDataset(data,selected.id):null;
      const snapshots=(scopeData?.snapshots||[]).filter(s=>s.records.length).slice().sort((a,b)=>a.date.localeCompare(b.date));
      return {...vendor,scopes,selected,scopeData,snapshots,hasData:Boolean(snapshots.length),latestDate:snapshots.at(-1)?.date||null};
    });
    const observedDates=[...new Set(rows.flatMap(row=>row.snapshots.map(s=>s.date)))].sort();
    const latestDate=observedDates.at(-1)||null,firstDate=observedDates[0]||null;
    let start=null,end=latestDate;
    if(latestDate){
      const desired=state.range==='latest'?latestDate:state.range==='all'?firstDate:M.dateRange(state.range,latestDate,firstDate).start;
      start=desired<firstDate?firstDate:desired;
    }
    const dates=calendarDates(start,end);
    for(const row of rows){
      const view=row.hasData?M.aggregate(row.scopeData,{start,end,contentType:state.contentType}):null;
      row.slots=view?view.observedSlots:null;
      row.share=view?.shares.tencent??null;
      row.recordCount=view?.rows.length??null;
      row.matchedDates=view?.dates||[];
      const timeline=new Map((view?.timeline||[]).map(day=>[day.date,day]));
      row.points=dates.map(date=>{
        const day=timeline.get(date);
        return {date,share:day?.shares.tencent??null,slots:day?.slots??null};
      });
      row.canOpen=row.hasData;
    }
    const covered=rows.filter(row=>row.hasData).length;
    return {state,rows,dates,start,end,latestDate,covered,totalVendors:VENDORS.length,
      totalSlots:covered?rows.reduce((total,row)=>total+(row.slots||0),0):null,
      hasPoints:rows.some(row=>row.points.some(point=>point[state.metric]!=null)),
      hasTrend:rows.some(row=>row.points.filter(point=>point[state.metric]!=null).length>=2),
    };
  }

  function chartConfig(view) {
    const countMode=view.state.metric==='slots';
    const font={family:FONT,size:12,weight:'400'};
    return {
      type:'line',
      data:{labels:view.dates,datasets:view.rows.map(row=>{
        const values=row.points.map(point=>countMode?point.slots:point.share==null?null:point.share*100);
        const observed=values.filter(value=>value!=null).length;
        return {label:row.name,data:values,borderColor:row.color,backgroundColor:row.color,
          borderWidth:2,pointRadius:observed<=1?5:3,pointHoverRadius:6,pointHitRadius:10,pointStyle:row.pointStyle,
          spanGaps:false,showLine:observed>=2,tension:0,fill:false};
      })},
      options:{responsive:true,maintainAspectRatio:false,animation:false,
        locale:'zh-CN',font,interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:false},
          tooltip:{titleFont:font,bodyFont:font,footerFont:font,displayColors:true,callbacks:{
            title:items=>items[0]?.label||'',
            label:context=>context.dataset.label+'：'+(countMode?context.parsed.y+' 个有记录资源位':context.parsed.y.toFixed(1)+'%'),
          }},
        },
        scales:{
          x:{type:'category',offset:true,title:{display:false,font},grid:{display:false},
            ticks:{font,color:'#111111',maxTicksLimit:7,maxRotation:0,callback:function(value){const label=this.getLabelForValue(value);return label?.slice(5)||label;}}},
          y:{type:'linear',min:0,...(countMode?{suggestedMax:Math.max(1,...view.rows.flatMap(row=>row.points.map(point=>point.slots||0)))}:{max:100}),
            title:{display:true,text:countMode?'有记录资源位数':'腾讯资源占比',font,color:'#111111'},
            grid:{color:'#edf0f5'},border:{display:false},
            ticks:{font,color:'#111111',maxTicksLimit:6,...(countMode?{precision:0}:{}),callback:value=>countMode?String(value):value+'%'},
          },
        },
      },
    };
  }

  function scopeControl(row) {
    if(!row.selected)return '<span class="summary-muted">待接入</span>';
    return '<select class="summary-scope" data-summary-scope="'+row.id+'" aria-label="'+esc(row.name)+'数据范围" '+(row.scopes.length<2?'disabled':'')+'>'+row.scopes.map(scope=>'<option value="'+esc(scope.id)+'" '+(scope.id===row.selected.id?'selected':'')+'>'+esc(scope.edition_name||scope.label)+(scope.hasData?'':' · 暂无记录')+'</option>').join('')+'</select>';
  }
  function dailyTable(view) {
    const countMode=view.state.metric==='slots';
    return '<details class="summary-data-details"><summary>查看逐日数据</summary><div class="summary-table-wrap" tabindex="0"><table class="summary-table summary-daily-table"><colgroup><col class="col-date"><col span="5"></colgroup><caption>'+esc(countMode?'有记录资源位数（当前内容筛选）':'腾讯资源占比')+'</caption><thead><tr><th scope="col">日期</th>'+view.rows.map(row=>'<th scope="col">'+row.name+'</th>').join('')+'</tr></thead><tbody>'+view.dates.map((date,index)=>'<tr><th scope="row">'+date+'</th>'+view.rows.map(row=>'<td>'+(countMode?(row.points[index].slots??'—'):percent(row.points[index].share))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
  }
  function render({data,onOpenDataset}={}) {
    const panel=root.document?.getElementById('summary-panel');
    if(!panel||!data)return;
    const view=buildView(data,uiState);uiState=view.state;
    if(activeChart){activeChart.destroy();activeChart=null;}
    const countMode=view.state.metric==='slots';
    const stat=(label,value)=>'<div><dt class="summary-stat-label">'+label+'</dt><dd class="summary-stat-value">'+value+'</dd></div>';
    const dateText=view.start?(view.start===view.end?view.end:view.start+' — '+view.end):'暂无已发布记录';
    const chartStatus=view.hasPoints&&!view.hasTrend?'暂无多日趋势':'';
    const toolbar='<div class="summary-toolbar"><dl class="summary-stats" aria-label="汇总数据">'+
      stat('已覆盖厂商',view.covered+' <small>/ '+view.totalVendors+'</small>')+
      stat('资源位总数',view.totalSlots??'—')+'</dl>'+
      '<div class="summary-controls"><label>统计日期<select id="summary-range">'+['latest','7','30','90','all'].map(value=>'<option value="'+value+'" '+(view.state.range===value?'selected':'')+'>'+RANGES[value]+'</option>').join('')+'</select></label>'+
      '<label>内容范围<select id="summary-content">'+Object.entries(CONTENT).map(([value,label])=>'<option value="'+value+'" '+(view.state.contentType===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div></div>';
    const vendors='<section class="summary-vendors" aria-labelledby="summary-vendors-title"><div class="summary-section-head"><div class="title-with-note"><h2 id="summary-vendors-title">厂商对比</h2></div><p class="summary-sub">'+dateText+' · '+CONTENT[view.state.contentType]+'</p></div>'+
      '<div class="summary-table-wrap" tabindex="0" role="region" aria-label="五厂商资源概览"><table class="summary-table summary-comparison-table"><colgroup><col class="col-vendor"><col class="col-share"><col class="col-count"><col class="col-scope"><col class="col-date"><col class="col-action"></colgroup><thead><tr><th scope="col">厂商</th><th scope="col">腾讯资源占比</th><th scope="col">资源位</th><th scope="col">范围</th><th scope="col">最新记录</th><th scope="col">详情</th></tr></thead><tbody>'+view.rows.map(row=>'<tr class="'+(row.hasData?'is-ready':'is-pending')+'"><th scope="row"><span class="summary-vendor-name"><i style="background:'+row.color+'" aria-hidden="true"></i>'+row.name+'</span></th><td>'+percent(row.share)+(row.hasData&&!row.recordCount?'<small class="summary-muted">当前范围无匹配内容</small>':'')+'</td><td>'+(row.slots??'—')+'</td><td>'+scopeControl(row)+'</td><td>'+ (row.latestDate||'—')+'</td><td><button type="button" class="summary-open" data-summary-open="'+esc(row.selected?.id||'')+'" '+(row.canOpen?'':'disabled')+'>'+(row.canOpen?'进入详情':row.selected?'暂无记录':'待接入')+'</button></td></tr>').join('')+'</tbody></table></div>'+
      '</section>';
    const trend='<section class="summary-trend'+(view.hasPoints&&!view.hasTrend?' is-compact':'')+'" aria-labelledby="summary-trend-title"><div class="summary-section-head"><div class="title-with-note"><h2 id="summary-trend-title">'+(countMode?'各厂商资源位数量':'各厂商腾讯资源占比')+'</h2></div>'+
      '<div class="summary-metric" role="group" aria-label="趋势指标"><button type="button" data-summary-metric="share" aria-pressed="'+(!countMode)+'">腾讯资源占比</button><button type="button" data-summary-metric="slots" aria-pressed="'+countMode+'">资源位数量</button></div></div>'+
      '<div class="summary-legend" aria-label="厂商图例">'+view.rows.map(row=>'<span class="summary-legend-item '+(row.hasData?'':'is-pending')+'"><i style="background:'+row.color+'" aria-hidden="true"></i>'+row.name+(row.hasData?'':' · '+(row.selected?'暂无记录':'待接入'))+'</span>').join('')+'</div>'+
      (view.hasPoints?'<div class="summary-chart-wrap"><canvas id="summary-chart" role="img" aria-label="'+(countMode?'各厂商有记录资源位数':'各厂商腾讯资源占比')+'，'+esc(CONTENT[view.state.contentType])+'，'+view.start+'至'+view.end+'" aria-describedby="summary-chart-status">逐日数值可在下方“查看逐日数据”中阅读。</canvas></div>':'<div class="summary-empty">当前范围暂无匹配数据。</div>')+
      '<p class="summary-status" id="summary-chart-status" role="status">'+chartStatus+'</p>'+
      (view.hasPoints?dailyTable(view):'')+'</section>';
    panel.innerHTML=toolbar+vendors+trend;
    panel.querySelector('#summary-range').addEventListener('change',event=>{uiState.range=event.target.value;render({data,onOpenDataset});});
    panel.querySelector('#summary-content').addEventListener('change',event=>{uiState.contentType=event.target.value;render({data,onOpenDataset});});
    panel.querySelectorAll('[data-summary-metric]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();uiState.metric=button.dataset.summaryMetric;render({data,onOpenDataset});}));
    panel.querySelectorAll('[data-summary-scope]').forEach(select=>select.addEventListener('change',event=>{event.stopPropagation();uiState.scopes[select.dataset.summaryScope]=select.value;render({data,onOpenDataset});}));
    panel.querySelectorAll('[data-summary-open]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();if(!button.disabled&&typeof onOpenDataset==='function')onOpenDataset(button.dataset.summaryOpen,{contentType:view.state.contentType,range:{start:view.start,end:view.end},platform:'all',priority:'all'});}));
    if(view.hasPoints){
      if(typeof root.Chart==='function')activeChart=new root.Chart(panel.querySelector('#summary-chart'),chartConfig(view));
      else{
        panel.querySelector('.summary-chart-wrap').hidden=true;
        panel.querySelector('#summary-chart-status').textContent='趋势图暂未加载';
        panel.querySelector('.summary-data-details').open=true;
      }
    }
    return view;
  }
  root.ResourceWatchSummary={render,buildView,chartConfig};
})(globalThis);
