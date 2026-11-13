import './view-model.js';
export function rowsFor(snapshot, platform='all', query='') {
  const q=query.trim().toLocaleLowerCase();
  return (snapshot?.records||[]).filter(r=>(platform==='all'||r.app_key===platform)&&(!q||[r.object_name,r.headline,r.copy,r.slot_name,r.module,r.genre].join(' ').toLocaleLowerCase().includes(q)));
}
export const contentKey = globalThis.ResourceWatchModel.contentKey;
export function stats(rows) {return {records:rows.length,slots:new Set(rows.map(r=>r.slot_id)).size,objects:new Set(rows.map(r=>r.object_name).filter(Boolean)).size,pages:new Set(rows.map(r=>r.app_key+'/'+r.page)).size};}
export const {compareSnapshots, datePresentation, selectionAfterUpdate} = globalThis.ResourceWatchModel;
export function toCsv(rows) {
  const cols=[['sample_date','日期'],['platform','平台'],['slot_name','资源位名称'],['module','页面原标题'],['object_name','游戏或应用'],['headline','主标题'],['copy','文案'],['rank','页面名次'],['period_text','活动/上线时间'],['observed_at','采集时间'],['visibility','可见性'],['notes','备注']];
  const quote=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[cols.map(x=>quote(x[1])).join(','),...rows.map(r=>cols.map(x=>quote(r[x[0]])).join(','))].join('\r\n');
}
