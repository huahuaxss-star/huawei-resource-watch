// Visual design adapted from Claude's user-requested V2 proposal.
import {compareSnapshots, stats} from './core.js';
let STORE=window.RESOURCE_WATCH_DATA;
let selectedDate=STORE.snapshots.at(-1)?.date || '';
let DATA = makeData();
function makeData(){const i=STORE.snapshots.findIndex(s=>s.date===selectedDate),s=STORE.snapshots[i];return {...s,prev:STORE.snapshots[i-1]||null,slots:STORE.slots.filter(x=>s.covered_slots.includes(x.id))};}
function safeShot(s){return typeof s==='string' && /^evidence\/\d{8}\/[a-f0-9]+\.(jpeg|jpg|png)$/.test(s);}
const PLAT = {gamecenter:{name:"游戏中心",cls:"gc"},appgallery:{name:"应用市场",cls:"ag"}};
const ORDER = ["gamecenter","appgallery"];
let cur = "all";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let slotById = Object.fromEntries(DATA.slots.map(s => [s.id, s]));
let recsBySlot = {};
DATA.records.forEach(r => (recsBySlot[r.slot_id] ||= []).push(r));
const short = s => s.name.includes("·") ? s.name.split("·")[1] : s.name;
const pageLabel = p => p.replace("/精选","");
const title = r => r.object_name || r.headline;
const plats = () => cur === "all" ? ORDER : [cur];
const slotsOf = (app, pr) => DATA.slots.filter(s => s.app === app && (!pr || s.priority === pr)).sort((a,b) => a.order - b.order);

function repeats(app){
  const m = {};
  DATA.records.filter(r => r.app_key === app && r.object_name).forEach(r => {
    (m[r.object_name] ||= new Set()).add(r.slot_id);
  });
  return Object.entries(m).filter(([,s]) => s.size > 1).map(([n,s]) => [n, [...s]])
    .sort((a,b) => b[1].length - a[1].length || slotById[a[1][0]].order - slotById[b[1][0]].order);
}

function overview(){
  const all = DATA.records.filter(r => cur === "all" || r.app_key === cur);
  const gc = all.filter(r => r.app_key === "gamecenter").length, ag = all.length - gc;
  document.getElementById("ov-sub").textContent = `${DATA.date} 记录`;
  document.getElementById("lead").innerHTML =
    `今天看到 <b>${DATA.slots.length}</b> 个位置、<b>${all.length}</b> 条内容（游戏中心 ${gc} 条，应用市场 ${ag} 条）。重点位置共 <b>${DATA.slots.filter(s=>s.priority==="focus").length}</b> 个，主推内容如下。`;
  document.getElementById("ov").innerHTML = plats().map(app => {
    const P = PLAT[app], slots = slotsOf(app), recs = all.filter(r => r.app_key === app);
    const pages = new Set(slots.map(s => s.page)).size;
    const focus = slotsOf(app, "focus").flatMap(s => (recsBySlot[s.id]||[]).map(r => ({r, s})));
    const rep = repeats(app);
    return `<div class="ovc ${P.cls}">
      <div class="row1"><span class="ptag">${P.name}</span><span class="nums"><b>${pages}</b> 页 · <b>${slots.length}</b> 个位置 · <b>${recs.length}</b> 条</span></div>
      <h3>重点位置在推</h3>
      <ul class="hl">${focus.map(({r,s}) => `<li><a class="n" href="#slot-${s.id}">${esc(title(r))}</a><span class="w">${esc(pageLabel(s.page))} · ${esc(short(s))}</span></li>`).join("")}</ul>
      ${rep.length ? `<h3>同一天出现在多个位置</h3><div class="chips">${rep.map(([n,ss]) => `<span class="chip" title="${esc(ss.map(id=>slotById[id].name).join("、"))}">${esc(n)}<i>×${ss.length}</i></span>`).join("")}</div>` : ""}
    </div>`;
  }).join("");
  document.getElementById("diff-text").textContent = DATA.prev
    ? "" : `这是第一次记录（${DATA.date}），作为基线。下次记录起在这里列出新出现、换内容和本次未见的位置。`;
}

function kv(r){
  const s = slotById[r.slot_id];
  const rows = [
    [r.module_name_source === "采集位置描述" ? "记录位置" : "页面原标题", r.module], ["位置", r.position_note], ["页面标签", r.label],
    ["类型", r.genre], ["评分", r.score], ["活动/上线", r.period_text], ["按钮", r.cta_text],
    ["可见性", r.visibility], 
    ["原始证据", safeShot(r.screenshot) ? `<a href="${esc(r.screenshot)}" target="_blank" rel="noopener">查看原始截图 ↗</a>` : ""],
    ["编号", `${r.record_id} · ${esc(r.observed_at.slice(11,16))}`]
  ].filter(([,v]) => v);
  return `<dl class="kv">${rows.map(([k,v]) => `<dt>${k}</dt><dd>${k==="原始证据"||k==="编号" ? v : esc(v)}</dd>`).join("")}</dl>`;
}

function focus(){
  document.getElementById("focus-cols").innerHTML = plats().map(app => {
    const P = PLAT[app];
    return `<div class="col ${P.cls}"><div class="ptag">${P.name}</div>${slotsOf(app,"focus").map(s => {
      const recs = recsBySlot[s.id] || [];
      return `<article class="slot" id="slot-${s.id}">
        <div class="slot-h"><span class="pg">${esc(pageLabel(s.page))}</span>·<span class="nm">${esc(short(s))}</span><span class="kd">${esc(s.kind)}</span></div>
        ${recs.map(r => {
          const sub = r.object_name ? r.headline : "";
          const tags = [r.label, r.period_text].filter(Boolean);
          return `<div class="item">
            <div class="t">${esc(title(r))}${r.object_name ? "" : `<span class="nonprod">非单一产品</span>`}</div>
            ${sub ? `<div class="hd">${esc(sub)}</div>` : ""}
            ${r.copy ? `<div class="cp">${esc(r.copy)}</div>` : ""}
            ${tags.length ? `<div class="tags">${tags.map((t,i) => `<span class="tag${i?" plain":""}">${esc(t)}</span>`).join("")}</div>` : ""}
            <details class="more"><summary>原文与证据</summary>${kv(r)}</details>
          </div>`;
        }).join("") || `<div class="item"><div class="cp">本次未采到</div></div>`}
      </article>`;
    }).join("")}</div>`;
  }).join("");
}

function other(){
  document.getElementById("other-cols").innerHTML = plats().map(app => {
    const P = PLAT[app], slots = slotsOf(app, "other");
    const pages = [...new Set(slots.map(s => s.page))];
    return `<div class="col ${P.cls}"><div class="ptag">${P.name}</div><div class="list">${pages.map(pg => `
      <div class="pgh">${esc(pageLabel(pg))}</div>
      ${slots.filter(s => s.page === pg).map(s => {
        const recs = recsBySlot[s.id] || [];
        return `<details class="orow" id="slot-${s.id}"><summary>
          <span class="sn">${esc(short(s))}<small>${esc(s.aliases[0]||"")}</small></span>
          <span class="prods">${recs.map(r => `${r.rank ? `<span class="rk">#${esc(r.rank)}</span>` : ""}${esc(title(r))}`).join('<span class="sep">/</span>') || '<span class="note">本次未采到</span>'}</span>
          <span class="ar">›</span></summary>
          <div class="body">${recs.map(r => `<div class="li"><b>${esc(title(r))}</b>${esc(r.copy || r.headline || "")}${r.genre ? ` · ${esc(r.genre)}` : ""}</div>
            <details class="more"><summary>原文与证据</summary>${kv(r)}</details>`).join("")}</div>
        </details>`;
      }).join("")}`).join("")}</div></div>`;
  }).join("");
}

function footer(){
  fillDates(); document.getElementById("time-note").textContent = ` · ${DATA.completed_at.slice(11,16)} 记录`;
  document.getElementById("ver").textContent = `${STORE.snapshots.length} 个记录日 · 北京时间`;
  document.getElementById("scope").textContent = `范围：${DATA.scope}（${DATA.started_at.slice(11,16)}–${DATA.completed_at.slice(11,16)}，单台手机）。`;
  document.getElementById("naming").innerHTML = `<table><thead><tr><th>平台</th><th>资源位</th><th>页面原标题</th><th>分组</th></tr></thead><tbody>${
    [...DATA.slots].sort((a,b)=>a.order-b.order).map(s => `<tr><td>${PLAT[s.app].name}</td><td>${esc(s.name)}</td><td>${esc(s.aliases.join("、"))}</td><td>${s.priority==="focus"?"重点":"其他"}</td></tr>`).join("")
  }</tbody></table>`;
}

function render(){ prepare(); overview(); focus(); other(); footer(); renderDiff(); renderHistory(); renderSummary(); }
document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
  cur = b.dataset.p;
  document.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
  render();
}));
render();

function prepare(){DATA=makeData();slotById=Object.fromEntries(STORE.slots.map(s=>[s.id,s]));recsBySlot={};DATA.records.forEach(r=>(recsBySlot[r.slot_id]||=[]).push(r));}
function fillDates(){const e=document.getElementById('date-select');e.innerHTML=STORE.snapshots.slice().reverse().map(s=>`<option value="${s.date}">${s.date}</option>`).join('');e.value=selectedDate;}
function renderSummary(){
 const rr=DATA.records.filter(r=>cur==='all'||r.app_key===cur),s=stats(rr),n=new Set(rr.filter(r=>slotById[r.slot_id].priority==='focus').map(r=>r.slot_id)).size;
 document.getElementById('lead').innerHTML=`本次看到 <b>${s.slots}</b> 个位置、<b>${rr.length}</b> 条内容。重点位置 <b>${n}</b> 个，先看它们在推什么。`;
 const latest=STORE.snapshots.at(-1),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const note=document.getElementById('stale-note');note.hidden=latest.date===today;note.textContent=`最近成功记录：${latest.date}。今天尚无已核对记录。`;
}
function renderDiff(){
 const d=compareSnapshots(DATA.prev,DATA,cur),detail=document.getElementById('diff-details'),list=document.getElementById('diff-list');detail.hidden=!d.ready;
 if(!d.ready){document.getElementById('diff-text').textContent='第一份观察记录。下次记录后，比较同一位置的内容变化。';list.innerHTML='';return;}
 const counts={seen:0,changed:0,not_seen:0,same:0};d.items.forEach(x=>counts[x.status]++);
 document.getElementById('diff-text').textContent=`${d.comparableSlots.length} 个共同记录位置：本次见到 ${counts.seen} 条、内容变化 ${counts.changed} 条、本次未见 ${counts.not_seen} 条。`;
 const labels={seen:'本次见到',changed:'内容变化',not_seen:'本次未见'};
 list.innerHTML=(d.routeChanged?'<p class="note">记录路线有调整，以下差异仅供参考。</p>':'')+(d.unmatchedSlots.length?`<p class="note">${d.unmatchedSlots.length} 个位置只有一侧采到，未做增减判断。</p>`:'')+d.items.filter(x=>x.status!=='same').map(x=>`<div class="diff-item"><span class="diff-tag ${x.status}">${labels[x.status]}</span><div><b>${esc(title(x.row))}</b><span class="note"> · ${esc(x.row.slot_name)}</span>${x.status==='changed'?'<p>上次：'+esc([x.before.headline,x.before.copy,x.before.period_text].filter(Boolean).join(' / '))+'<br>本次：'+esc([x.row.headline,x.row.copy,x.row.period_text].filter(Boolean).join(' / '))+'</p>':''}</div></div>`).join('')+'<p class="note">“本次未见”不代表下架。轮播及个性化内容可能随时点变化。</p>';
}
function renderHistory(){
 const days=STORE.snapshots.slice().reverse(),max=Math.max(1,...days.map(s=>s.records.filter(r=>cur==='all'||r.app_key===cur).length));
 document.getElementById('history').innerHTML=days.map(s=>{const rr=s.records.filter(r=>cur==='all'||r.app_key===cur);return `<div class="history-row"><button data-history-date="${s.date}">${s.date}</button><div class="history-track"><span style="width:${rr.length/max*100}%"></span></div><span>${rr.length} 条 · ${new Set(rr.map(r=>r.slot_id)).size} 位</span><small>${s.completed_at.slice(11,16)} 已核对</small></div>`;}).join('')+'<p class="note">条数反映记录覆盖及可见内容，不能用于推算曝光或资源投入。</p>';
 document.querySelectorAll('[data-history-date]').forEach(b=>b.onclick=()=>{selectedDate=b.dataset.historyDate;render();window.scrollTo({top:0,behavior:'smooth'});});
}
async function refresh(manual=false){
 const status=document.getElementById('update-state');
 if(location.protocol==='file:'){if(manual)status.textContent='本地快照；在线页面可自动更新';return;}
 try{
  const r=await fetch('data/manifest.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('manifest');const m=await r.json();
  if(m.version!==STORE.version){const r=await fetch('data/site.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('data');const n=await r.json();if(n.schema_version!==1||!Array.isArray(n.snapshots)||!Array.isArray(n.slots))throw Error('schema');const follow=selectedDate===STORE.snapshots.at(-1)?.date;STORE=n;if(follow)selectedDate=STORE.snapshots.at(-1)?.date||'';render();status.textContent='已更新至最新成功记录';}else if(manual)status.textContent='已是最新成功记录';
 }catch{status.textContent='更新检查失败，当前记录仍可查看';}
}
document.getElementById('date-select').onchange=e=>{selectedDate=e.target.value;render();};
document.getElementById('refresh').onclick=()=>refresh(true);
setInterval(()=>{if(!document.hidden)refresh();},60000);
