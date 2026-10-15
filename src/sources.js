export function submissionTime(value) {
  const match=String(value||'').trim().match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/);
  if(!match)return 0;
  const [,year,month,day,hour,minute,second='00',zone='+09:00']=match;
  const calendar=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
  if(calendar.getUTCFullYear()!==Number(year)||calendar.getUTCMonth()+1!==Number(month)||calendar.getUTCDate()!==Number(day)||Number(hour)>23||Number(minute)>59||Number(second)>59)return 0;
  const time=Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`);
  return Number.isFinite(time)?time:0;
}
export function sourceLanguage(label) {
  if(/python/i.test(label))return 'python';
  if(/c\+\+|g\+\+/i.test(label))return 'cpp';
  if(/java/i.test(label))return 'java';
  if(/^(?:c(?:\b|\()|gcc)/i.test(String(label).trim()))return 'c';
  return null;
}
export function fullScore(score) {const match=String(score||'').match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);return !!match&&Number(match[2])>0&&Number(match[1])>=Number(match[2]);}
export function latestSource(local,history,language) {
  const remote=history.filter(item=>(item.sourcePath||item.editPath)&&(!item.language||item.language===language)).sort((a,b)=>submissionTime(b.date)-submissionTime(a.date)||String(b.id).length-String(a.id).length||String(b.id).localeCompare(String(a.id)))[0];
  if(!remote)return local&&typeof local.code==='string'?{kind:'local',draft:local}:null;
  if(local&&typeof local.code==='string'&&submissionTime(remote.date)<=(Number(local.updated)||0))return {kind:'local',draft:local};
  return {kind:'remote',result:remote};
}
