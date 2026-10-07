const origin='https://ex-oj.sejong.ac.kr';
const path=(kind,...ids)=>'/index.php/judge/'+kind+'/'+ids.join('/');
const courseNames={1:'OJ 연습문제',2:'C프로그래밍 및 실습'};
const contestNames={10:'기본 입출력',11:'포인터와 구조체'};
const problemNames={101:'두 수의 합',102:'최댓값',103:'구조체 연습'};
const records=new Map();let serial=1000;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function tableRow(record,c,t,p){return `<tr><td>${record.id}</td><td>DEMO</td><td>${problemNames[p]}</td><td>${record.result}</td><td>${record.sample?`<a href="${path('sample_status',c,t,p,record.id,0)}">Sample</a>`:'100 /100'}</td><td><a href="${path('showsource',c,p,record.id)}">C</a> / <a href="${path('submitpage',c,t,p)}/0?sid=${record.id}">edit</a></td><td>1 ms</td><td>1024 KB</td><td>2026-01-01 12:00:00</td></tr>`;}
function resultTable(c,t,p){return `<table id="result-tab"><tr>${['Submission ID','User ID','PB Name','Result','Score','Code','time','Memory','Submission Time'].map(v=>'<th>'+v+'</th>').join('')}</tr>${(records.get(String(p))||[]).map(r=>tableRow(r,c,t,p)).join('')}</table>`;}
export function fixtureRequest({path:inputPath,method,fields}) {
  const url=new URL(inputPath,origin),parts=url.pathname.split('/').filter(Boolean),kind=parts[2],c=parts[3],t=parts[4],p=parts[5];let html='';
  if(url.pathname==='/index.php/judge')html=Object.entries(courseNames).map(([id,title])=>`<a href="${path('studentmain',id)}">${title}</a>`).join('');
  else if(kind==='studentmain')html=Object.entries(contestNames).map(([id,title])=>`<a href="${path('contestproblemlist',c,id)}">${title}</a>`).join('');
  else if(kind==='contestproblemlist')html=`<table><tr><th>Num</th><th>Name</th><th>Submit</th><th>My Score</th><th>Start</th><th>End</th><th>Status</th></tr>${(t==='11'?['103']:['101','102']).map((id,i)=>`<tr><td>${i+1}</td><td><a href="${path('contestprobleminfo',c,t,id)}">${problemNames[id]}</a></td><td>${(records.get(id)||[]).length}</td><td>${records.has(id)?'100':'0'} /100</td><td>Infinite</td><td>Infinite</td><td><a href="${path('status',c,t,id)}?uid=DEMO">Status</a></td></tr>`).join('')}</table>`;
  else if(kind==='contestprobleminfo')html=`<div class="col-md-9"><h3>${contestNames[t]}</h3></div><div class="col-md-9"><div class="table-responsive"><table><thead><tr><th>Title</th><th>Time limit</th><th>Memory limit</th></tr></thead><tbody><tr><td>${problemNames[p]}</td><td>1000ms</td><td>128MB</td></tr></tbody></table></div>${p==='103'?'<pre> </pre>':`<h2>${problemNames[p]}</h2><p>${p==='101'?'정수 A와 B를 입력받아 두 수의 합을 출력하세요.':'정수 N개를 입력받아 가장 큰 값을 출력하세요.'}</p><h3>입력</h3><p>${p==='101'?'첫째 줄에 정수 A와 B가 주어집니다.':'첫째 줄에 N, 둘째 줄에 N개의 정수가 주어집니다.'}</p><h3>출력</h3><p>${p==='101'?'A + B를 출력합니다.':'가장 큰 정수를 출력합니다.'}</p><h3>입력 예시</h3><pre>${p==='101'?'7 5':'5\n1 9 3 7 2'}</pre><h3>출력 예시</h3><pre>${p==='101'?'12':'9'}</pre>`}<div><a class="btn" href="${path('submitpage',c,t,p)}">Coding</a></div></div>`;
  else if(kind==='submitpage'){
    const sid=url.searchParams.get('sid'),record=(records.get(String(p))||[]).find(r=>r.id===sid);
    html=`<form id="submit_form" method="post" action="${path('submit',c,t,p)}/"><input type="submit" value="Submit" onclick="submit_url(0)"><input type="submit" value="Test Sample" onclick="submit_url(1)"><label><input type="radio" name="lang" id="C" value="1" checked>C(gcc-7.5.0)</label><label><input type="radio" name="lang" id="C++" value="2">C++(g++-7.5.0)</label><label><input type="radio" name="lang" id="python3" value="5">Python3</label><pre id="editor">${escape(record?.code||'')}</pre></form>`;
  } else if(kind==='submit'&&method==='POST') {
    const data=new URLSearchParams(fields);if(!data.get('real_source_code')||!['1','2','5'].includes(data.get('lang')))throw Error('제출 내용 오류');
    const record={id:String(++serial),result:'Accept',sample:parts[6]==='1',code:data.get('real_source_code')};const list=records.get(String(p))||[];list.unshift(record);records.set(String(p),list);html=resultTable(c,t,p);
  } else if(kind==='status')html=resultTable(c,t,p);
  else if(kind==='showsource'){const record=(records.get(String(t))||[]).find(r=>r.id===p);html='<pre id="editor">'+escape(record?.code||'')+'</pre>';}
  else if(kind==='sample_status')html=`<div class="col-md-9">${resultTable(c,t,p)}<h3>Sample 1 · Accept</h3><pre>입력\n7 5\n\n기대 출력\n12\n\n실제 출력\n12</pre></div>`;
  else return {error:'미리보기에서 지원하지 않는 경로입니다.'};
  return {response:{text:'<!doctype html><html><body>'+html+'</body></html>',url:url.href,status:200}};
}
