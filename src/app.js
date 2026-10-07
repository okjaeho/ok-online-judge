import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import 'monaco-editor/languages/definitions/python/register.js';
import 'monaco-editor/languages/definitions/java/register.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import DOMPurify from 'dompurify';
import * as OJ from './oj.js';
import { readLocal, writeLocal, book } from './store.js';
import { loadPdf, drawPdf } from './pdf.js';
import { createNavigator } from './navigator.js';

const $ = id => document.getElementById(id);
const preview = ['127.0.0.1', 'localhost'].includes(location.hostname);
const prefs = readLocal('preferences', { ratio:43, font:14, theme:'vs-dark', consoleHeight:230 });
const state = { origin:'', courses:[], contests:[], problems:[], course:null, contest:null, problem:null, form:null, history:[], epoch:0, pdf:null, pdfUrl:null, bookMode:false };
const models = new Map(), requests = new Map();
let requestCount = 0, editorKey, changingEditor = false, savingError = false, submitting = false, pollController;
let runWorker, runTimer, runId = 0, running = false;
const navigator=createNavigator({host:$('courseTree'),
  loadContests:async course=>OJ.contests(await read(course.path),state.origin),
  loadProblems:async contest=>OJ.problems(await read(contest.path),state.origin),
  onSelect:async(course,contest,problem)=>{
    if(course.id!==state.course?.id)await selectCourse(course.id,{contest:contest.id,problem:problem.id});
    else if(contest.id!==state.contest?.id)await selectContest(contest.id,problem.id);
    else if(problem.id!==state.problem?.id)await selectProblem(problem.id);
    if(innerWidth<800)setSidebar(false);
  },onError:error=>notice(error.message,true),onOpened:expanded=>{try{writeLocal('folders:'+state.origin,expanded);}catch{}}
});
globalThis.MonacoEnvironment = { getWorker:() => new Worker(new URL('editor.worker.js', location.href), { type:'module' }) };
const editor = monaco.editor.create($('editor'), {
  value:'', language:'c', theme:prefs.theme, fontSize:prefs.font, fontFamily:'Consolas, "Cascadia Code", monospace',
  automaticLayout:true, editContext:false, minimap:{enabled:false}, scrollBeyondLastLine:false, padding:{top:18,bottom:18}, tabSize:4,
  insertSpaces:true, autoClosingBrackets:'always', autoClosingQuotes:'always', autoIndent:'full',
  bracketPairColorization:{enabled:true}, guides:{bracketPairs:false,bracketPairsHorizontal:false,indentation:false,highlightActiveIndentation:false}, matchBrackets:'never', suggest:{showWords:true},
  wordBasedSuggestions:'currentDocument', renderLineHighlight:'none', stickyScroll:{enabled:false}, accessibilitySupport:'auto'
});
monaco.languages.registerCompletionItemProvider('c', {
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position), range = { startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn };
    return { suggestions:[
      { label:'printf', insertText:'printf("${1:%d}\\n", ${2:value});', detail:'stdio.h', kind:monaco.languages.CompletionItemKind.Function },
      { label:'scanf', insertText:'scanf("${1:%d}", &${2:value});', detail:'stdio.h', kind:monaco.languages.CompletionItemKind.Function },
      { label:'for', insertText:'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}', kind:monaco.languages.CompletionItemKind.Snippet },
      { label:'if', insertText:'if (${1:condition}) {\n\t$0\n}', kind:monaco.languages.CompletionItemKind.Snippet },
      { label:'malloc', insertText:'malloc(sizeof(${1:int}) * ${2:n})', detail:'stdlib.h', kind:monaco.languages.CompletionItemKind.Function }
    ].map(item=>({...item,range,insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet})) };
  }
});
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => submit(false));
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, runCode);
function notice(text, error=false) { $('notice').textContent=text; $('notice').hidden=!text; $('notice').classList.toggle('error',error); }
function remember() { try { writeLocal('preferences', prefs); } catch { notice('설정을 저장할 공간이 부족합니다.',true); } }
function namespace() { return state.origin + ':' + state.course?.id; }
function draftKey(problem=state.problem, language=$('language').value) { return state.origin + ':' + problem?.id + ':' + language; }
function draft() { return editorKey ? readLocal('draft:' + editorKey, {}) : {}; }
function saveDraft() {
  if (changingEditor || !editorKey) return;
  try { writeLocal('draft:' + editorKey, { code:editor.getValue(),stdin:$('stdin').value, view:editor.saveViewState(),updated:Date.now() }); $('saved').textContent='저장됨'; savingError=false; }
  catch { if(!savingError) notice('코드 자동 저장에 실패했습니다. 코드를 복사해 보관해주세요.',true); savingError=true; $('saved').textContent='저장 실패'; }
}
editor.onDidChangeModelContent(saveDraft); $('stdin').oninput=saveDraft;
function languageInfo() { return state.form?.languages.find(l=>l.id===$('language').value); }
function setEditor(language, initial) {
  saveDraft(); changingEditor=true;
  editorKey=draftKey(state.problem,language.id);
  if(!models.has(editorKey)) models.set(editorKey,monaco.editor.createModel(readLocal('draft:'+editorKey)?.code ?? initial ?? OJ.starter(language.editor),language.editor,monaco.Uri.parse('inmemory://ok-oj/'+encodeURIComponent(editorKey)+'.'+(language.editor==='cpp'?'cpp':language.editor==='python'?'py':language.editor==='java'?'java':'c'))));
  editor.setModel(models.get(editorKey));
  const saved=readLocal('draft:'+editorKey,{}); $('stdin').value=saved.stdin || ''; if(saved.view)editor.restoreViewState(saved.view);
  $('fileName').textContent=language.editor==='cpp'?'main.cpp':language.editor==='python'?'main.py':language.editor==='java'?'Main.java':'main.c';
  $('fileName').dataset.language=language.editor==='python'?'Py':language.editor==='cpp'?'C++':language.editor==='java'?'J':'C';
  $('saved').textContent='자동 저장';changingEditor=false; updateButtons();
}
function updateButtons() {
  const unavailable=!state.problem||!state.form||state.form.disabled||submitting;
  $('submit').disabled=unavailable; $('sample').disabled=unavailable||!state.form?.hasSample;
  $('run').disabled=!state.problem||(!running&&!['c','cpp','python'].includes(languageInfo()?.editor));
  $('restore').disabled=!state.history.some(h=>h.sourcePath||h.editPath)||submitting;
}
function options(select, list, selected) { select.replaceChildren(...list.map(item=>new Option(item.title,item.id,item.id===selected,item.id===selected))); }
function saveNavigation() { try { writeLocal('navigation:'+state.origin,{course:state.course?.id,contest:state.contest?.id,problem:state.problem?.id}); } catch {} }
function stoppedRequest() { return Error('cancelled'); }
function haltPoll() { pollController?.abort(); pollController=null; }

async function connect() {
  if(preview) { state.origin='https://ex-oj.sejong.ac.kr'; return '/index.php/judge'; }
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('학교 OJ 페이지에서 확장 프로그램을 열어주세요.')),10000);
    const listener=event=>{
      if(event.source!==parent||!/^https:\/\/(ex-)?oj\.sejong\.ac\.kr$/.test(event.origin)||event.data?.channel!=='ok-oj'||!event.data.context)return;
      clearTimeout(timeout);window.removeEventListener('message',listener);state.origin=event.data.context.origin;resolve(event.data.context.path);
    };
    window.addEventListener('message',listener);parent.postMessage({channel:'ok-oj',type:'ready',id:'ready'},'*');
  });
}
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==state.origin||event.data?.channel!=='ok-oj')return;
  const pending=requests.get(event.data.id);if(!pending)return;
  clearTimeout(pending.timer);requests.delete(event.data.id);
  event.data.error?pending.reject(Error(event.data.error)):pending.resolve(event.data.response);
});
async function request(path, fields) {
  const payload={path,method:fields?'POST':'GET',fields};
  if(preview) {
    const response=await fetch('/fixture/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json();if(data.error)throw Error(data.error);return data.response;
  }
  return new Promise((resolve,reject)=>{
    const id=String(++requestCount),timer=setTimeout(()=>{requests.delete(id);reject(Error(fields?'제출 후 응답을 확인하지 못했습니다. 중복 제출을 피하려면 제출 기록을 확인해주세요.':'OJ 응답이 늦어지고 있습니다. 다시 열어주세요.'));},60000);
    requests.set(id,{resolve,reject,timer});parent.postMessage({channel:'ok-oj',type:'request',id,payload},state.origin);
  });
}
async function read(path) { return OJ.parse((await request(path)).text); }
async function loadHome(initialPath) {
  notice('강좌 불러오는 중…');
  const doc=await read('/index.php/judge');state.courses=OJ.courses(doc,state.origin);
  if(!state.courses.length)throw Error('등록된 강좌를 찾지 못했습니다. 원래 OJ의 My Class를 확인해주세요.');
  navigator.reset(state.courses,readLocal('folders:'+state.origin,[]));
  const saved=readLocal('navigation:'+state.origin,{}),initial=OJ.route(initialPath);
  const chosen=state.courses.find(c=>c.id===(initial.course||saved.course))||state.courses.find(c=>c.id!=='1')||state.courses[0];
  options($('course'),state.courses,chosen.id);await selectCourse(chosen.id,{contest:initial.contest||saved.contest,problem:initial.problem||saved.problem});
}
async function selectCourse(id, desired={}) {
  saveDraft();haltPoll();const epoch=++state.epoch;state.course=state.courses.find(c=>c.id===id);state.problem=null;state.form=null;updateButtons();
  options($('contest'),[],null);$('problems').replaceChildren();notice('탭 불러오는 중…');
  state.contests=await navigator.getContests(state.course);if(epoch!==state.epoch)return;
  await restoreBook();if(epoch!==state.epoch)return;
  if(!state.contests.length){notice('이 강좌의 문제 탭이 없습니다.');return;}
  const chosen=state.contests.find(c=>c.id===desired.contest)||state.contests[0];options($('contest'),state.contests,chosen.id);
  await selectContest(chosen.id,desired.problem);
}
async function selectContest(id, desired) {
  saveDraft();haltPoll();const epoch=++state.epoch;state.contest=state.contests.find(c=>c.id===id);state.problem=null;state.form=null;updateButtons();
  notice('문제 목록 불러오는 중…');const problems=await navigator.getProblems(state.course,state.contest);if(epoch!==state.epoch)return;
  state.problems=problems;renderProblemTabs();
  if(!state.problems.length){$('statement').replaceChildren(empty('아직 공개된 문제가 없습니다.'));notice('문제 목록을 확인하려면 원래 OJ 화면을 확인해주세요.');$('original').href=state.origin+state.contest.path;return;}
  const chosen=state.problems.find(p=>p.id===desired)||state.problems[0];await selectProblem(chosen.id);
}
function renderProblemTabs() {
  $('problems').replaceChildren(...state.problems.map(problem=>{
    const button=document.createElement('button');button.title=problem.title;button.textContent=problem.number||problem.title;button.setAttribute('role','tab');button.setAttribute('aria-label',problem.title+(problem.score?' · '+problem.score:''));button.setAttribute('aria-selected',String(problem.id===state.problem?.id));
    button.classList.toggle('selected',problem.id===state.problem?.id);button.classList.toggle('passed',/^100\s*\//.test(problem.score));const dot=document.createElement('span');dot.className='score-dot';button.append(dot);button.onclick=()=>guard(()=>selectProblem(problem.id));return button;
  }));
  const index=state.problems.findIndex(p=>p.id===state.problem?.id);$('previous').disabled=index<=0;$('next').disabled=index<0||index>=state.problems.length-1;
  $('breadcrumb').textContent=[state.course?.title,state.contest?.title,state.problem?.title].filter(Boolean).join('  /  ');
  if(state.problem)navigator.reveal(state.course,state.contest,state.problem).catch(error=>notice(error.message,true));
}
async function selectProblem(id) {
  saveDraft();haltPoll();const epoch=++state.epoch;state.problem=state.problems.find(p=>p.id===id);state.form=null;state.history=[];updateButtons();renderProblemTabs();saveNavigation();
  $('problemLabel').textContent=state.problem.title;$('original').href=state.origin+state.problem.path;$('limits').textContent='';notice('문제 불러오는 중…');
  const doc=await read(state.problem.path);if(epoch!==state.epoch)return;
  const statement=OJ.statement(doc,state.origin);$('limits').textContent=statement.meta;
  if(statement.html)$('statement').innerHTML=DOMPurify.sanitize(statement.html,{FORBID_TAGS:['iframe','object','embed','style','script'],FORBID_ATTR:['style'],ADD_ATTR:['target']});
  else { const node=empty('등록된 문제 설명이 없습니다.'); const pick=document.createElement('button');pick.textContent=state.pdf?'교재 보기':'교재 PDF 불러오기';pick.onclick=()=>state.pdf?showBook(true):$('pdfFile').click();node.append(pick);$('statement').replaceChildren(node);if(state.pdf)showBook(true); }
  if(!statement.submitPath){notice('제출 버튼을 찾지 못했습니다. 원문을 확인해주세요.',true);return;}
  const formDoc=await read(statement.submitPath);if(epoch!==state.epoch)return;state.form=OJ.submissionForm(formDoc,state.origin);
  if(!state.form.languages.length)throw Error('사용 가능한 제출 언어가 없습니다.');
  const lastLang=readLocal('language:'+state.origin),language=state.form.languages.find(l=>l.id===lastLang)||state.form.languages.find(l=>l.selected)||state.form.languages[0];
  $('language').replaceChildren(...state.form.languages.map(l=>new Option(l.label,l.id,l.id===language.id,l.id===language.id)));
  setEditor(language,state.form.source.trim()?state.form.source:undefined);notice('');
  if(state.problem.statusPath) { await refreshHistory(state.problem,epoch); if(epoch!==state.epoch)return; if(!readLocal('draft:'+editorKey)&&state.history[0]?.sourcePath) await restoreCode(state.history[0],false); }
  updateButtons();
}
function empty(text) { const div=document.createElement('div');div.className='empty';div.textContent=text;return div; }
function text(tag,value,className) { const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e; }
function resultSuccess(result) { return /^accept/i.test(result.result); }
function renderHistory() {
  if(!state.history.length){$('historyPane').replaceChildren(empty('제출 기록이 없습니다.'));return;}
  const table=document.createElement('table');const head=document.createElement('tr');for(const label of ['번호','결과','점수','시간','제출 시각','코드'])head.append(text('th',label));table.append(head);
  for(const result of state.history) {
    const row=document.createElement('tr');row.append(text('td',result.id),text('td',result.result,resultSuccess(result)?'accepted':result.pending?'':'failed'),text('td',result.score),text('td',result.time),text('td',result.date));
    const cell=document.createElement('td'),button=text('button','불러오기');button.onclick=()=>guard(()=>restoreCode(result));button.disabled=!result.sourcePath&&!result.editPath;cell.append(button);row.append(cell);table.append(row);
  }
  $('historyPane').replaceChildren(table);
}
async function refreshHistory(problem=state.problem, epoch=state.epoch) {
  if(!problem?.statusPath)return [];
  const history=OJ.results(await read(problem.statusPath),state.origin);
  if(epoch===state.epoch&&problem.id===state.problem?.id){state.history=history;renderHistory();updateButtons();}
  return history;
}
async function restoreCode(result=state.history[0], focus=true) {
  if(!result)return;const epoch=state.epoch,doc=await read(result.sourcePath||result.editPath);if(epoch!==state.epoch)return;
  const code=doc.querySelector('#editor')?.textContent||doc.querySelector('pre')?.textContent;
  if(code==null||!code.trim())throw Error('제출 코드를 불러오지 못했습니다.');
  editor.setValue(code);saveDraft();if(focus)editor.focus();notice('');
}
function setConsole(tab) {
  $('console').classList.remove('collapsed');
  for(const name of ['run','result','history']){$(name+'Pane').hidden=name!==tab;$(name+'Tab').classList.toggle('selected',name===tab);}
  editor.layout();
}
function showResult(result, label) {
  const card=document.createElement('div');card.className='result-card'+(resultSuccess(result)?'':' failed');card.append(text('span',result.result,'result-title'));
  const stats=document.createElement('div');stats.className='result-stats';for(const value of [label,/^sample$/i.test(result.score)?'':result.score,result.time,result.memory])if(value)stats.append(text('span',value));card.append(stats);$('resultPane').replaceChildren(card);
  if(result.samplePath||result.errorPath){const button=text('button',result.samplePath?'샘플 상세':'컴파일 오류');button.onclick=()=>guard(()=>resultDetails(result));card.append(button);}
}
async function resultDetails(result) {
  const epoch=state.epoch,doc=await read(result.samplePath||result.errorPath);if(epoch!==state.epoch)return;
  const areas=[...doc.querySelectorAll('.col-md-9')];const root=areas.at(-1)||doc.body;const copy=root.cloneNode(true);
  for(const e of copy.querySelectorAll('script,style,nav,form,input,button,footer,#editor,#result-tab,a.btn'))e.remove();
  const details=text('pre',copy.textContent.trim()||'추가 상세 결과가 없습니다.','result-details');$('resultPane').querySelector('.result-details')?.remove();$('resultPane').append(details);
}
async function submit(sample) {
  if(submitting||!state.form||!state.problem||state.form.disabled)return;
  if(sample&&!state.form.hasSample)return;saveDraft();if(!editor.getValue().trim()){notice('제출할 코드를 입력해주세요.',true);return;}
  const problem=state.problem,epoch=state.epoch,form=state.form,source=editor.getValue(),lang=$('language').value;submitting=true;haltPoll();updateButtons();setConsole('result');$('resultPane').replaceChildren(empty(sample?'Sample Submit 중…':'제출 중…'));notice('');
  try {
    const before=await refreshHistory(problem,epoch),beforeIds=new Set(before.map(r=>r.id));
    const fields=[...form.hidden,['lang',lang],['real_source_code',source]];
    const response=await request(form.action+(sample?'1':'0'),fields);
    if(epoch!==state.epoch){notice(problem.title+' 제출 완료. 해당 문제의 제출 기록을 확인해주세요.');return;}
    const immediate=OJ.results(OJ.parse(response.text),state.origin).find(r=>!beforeIds.has(r.id));
    let submitted=immediate;
    pollController=new AbortController();const signal=pollController.signal;
    for(let attempt=0;attempt<40;attempt++) {
      if(signal.aborted||epoch!==state.epoch)return;
      const history=await refreshHistory(problem,epoch);submitted=(submitted?history.find(r=>r.id===submitted.id):history.find(r=>!beforeIds.has(r.id)))||submitted;
      if(submitted){showResult(submitted,sample?'Sample':'Submit');if(!submitted.pending){if(submitted.samplePath||submitted.errorPath)await resultDetails(submitted);return;}}
      await new Promise(resolve=>{const timer=setTimeout(resolve,Math.min(5000,1200+attempt*200));signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
    }
    notice('채점이 아직 끝나지 않았습니다. 제출 기록을 새로고침해 확인해주세요.');
  } catch(error) {
    notice(error.message,true);if(epoch===state.epoch)$('resultPane').replaceChildren(empty('제출 기록을 확인한 뒤 다시 시도해주세요.'));
  } finally { submitting=false;updateButtons(); }
}
function stopRun(message='실행을 중지했습니다.') {
  runWorker?.terminate();runWorker=null;clearTimeout(runTimer);running=false;$('run').textContent='▷ Run';$('runInfo').textContent='';if(message)$('stdout').textContent=message;updateButtons();
}
function runCode() {
  if(running){stopRun();return;}
  const language=languageInfo()?.editor;if(!['c','cpp','python'].includes(language)||!state.problem)return;
  saveDraft();setConsole('run');running=true;const id=++runId;$('run').textContent='■ Stop';$('stdout').textContent='컴파일러 준비 중…';$('stdout').classList.remove('failure');updateButtons();
  if(!runWorker)runWorker=new Worker(new URL('run.worker.js',location.href));
  runWorker.onmessage=event=>{
    if(event.data.id!==runId)return;
    if(event.data.phase){$('stdout').textContent=event.data.phase;if(/컴파일 및/.test(event.data.phase)){clearTimeout(runTimer);runTimer=setTimeout(()=>stopRun('실행 시간이 30초를 넘겨 중지했습니다.'),30000);}return;}
    clearTimeout(runTimer);running=false;$('run').textContent='▷ Run';updateButtons();
    if(event.data.error){$('stdout').textContent=event.data.error;$('stdout').classList.add('failure');$('runInfo').textContent='실행 실패';runWorker?.terminate();runWorker=null;return;}
    const result=event.data.result;const failed=result.exitCode!==0;$('stdout').classList.toggle('failure',failed);$('stdout').textContent=result.errors?.length?result.errors.join('\n'):result.output||'(출력 없음)';
    $('runInfo').textContent=(result.runtime||'')+' · '+(failed?(result.exitCode==null?'컴파일 오류':'종료 코드 '+result.exitCode):'실행 '+result.runMs+'ms');
  };
  runWorker.onerror=event=>stopRun('실행 오류: '+event.message);
  runTimer=setTimeout(()=>stopRun('컴파일러 준비 시간이 초과됐습니다. 다시 실행해주세요.'),90000);
  runWorker.postMessage({id,code:editor.getValue(),stdin:$('stdin').value,language});
}

function showBook(value) {
  state.bookMode=value;$('statement').hidden=value;$('bookPane').hidden=!value;$('bookTab').classList.toggle('selected',value);$('statementTab').classList.toggle('selected',!value);
}
async function renderBook() {
  if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=null;
  $('bookName').textContent=state.pdf?.name||'교재 PDF';$('bookPage').value=state.pdf?.page||1;$('removeBook').disabled=!state.pdf;
  if(!state.pdf){const button=text('button','PDF 불러오기','empty-book');button.onclick=()=>$('pdfFile').click();$('pdfHost').replaceChildren(button);return;}
  const pdf=state.pdf,count=await loadPdf(pdf.blob);if(state.pdf!==pdf)return;
  state.pdfCount=count;$('bookTotal').textContent='/ '+count;$('bookPage').max=count;
  state.pdf.page=Math.min(state.pdf.page||1,count);$('bookPage').value=state.pdf.page;
  await drawPdf($('pdfHost'),state.pdf.page,$('bookZoom').value);
}
async function restoreBook() {
  const key=namespace(),pdf=await book(key)||null;if(key!==namespace())return;state.pdf=pdf;showBook(readLocal('bookMode:'+key,false));await renderBook();
}
$('pdfFile').onchange=()=>guard(async()=>{
  const file=$('pdfFile').files[0];if(!file)return;
  try {
    if(file.size>200*1024*1024)throw Error('교재는 200MB 이하의 PDF를 선택해주세요.');
    if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')throw Error('PDF 파일을 선택해주세요.');
    const key=namespace(),pdf={name:file.name,blob:file,page:1};await book(key,pdf);if(key!==namespace())return;state.pdf=pdf;showBook(true);await renderBook();writeLocal('bookMode:'+key,true);notice('');
  } finally { $('pdfFile').value=''; }
});
$('uploadBook').onclick=$('pickBook').onclick=()=>$('pdfFile').click();
$('removeBook').onclick=()=>guard(async()=>{const key=namespace();await book(key,null);if(key!==namespace())return;state.pdf=null;await loadPdf(null);await renderBook();});
async function changeBookPage(number) {if(!state.pdf)return;const key=namespace(),pdf=state.pdf;pdf.page=Math.max(1,Math.min(state.pdfCount||1,Math.floor(number)||1));$('bookPage').value=pdf.page;await book(key,pdf);if(key!==namespace())return;await drawPdf($('pdfHost'),pdf.page,$('bookZoom').value);}
$('bookPage').onchange=()=>guard(()=>changeBookPage(Number($('bookPage').value)));
$('bookPrevious').onclick=()=>guard(()=>changeBookPage((state.pdf?.page||1)-1));$('bookNext').onclick=()=>guard(()=>changeBookPage((state.pdf?.page||1)+1));
$('bookZoom').onchange=()=>guard(()=>drawPdf($('pdfHost'),state.pdf?.page||1,$('bookZoom').value));
let bookResizeTimer;new ResizeObserver(()=>{clearTimeout(bookResizeTimer);bookResizeTimer=setTimeout(()=>{if(state.bookMode&&state.pdf&&$('bookZoom').value==='fit')guard(()=>drawPdf($('pdfHost'),state.pdf.page,'fit'));},120);}).observe($('pdfHost'));
$('bookTab').onclick=()=>{showBook(true);try{writeLocal('bookMode:'+namespace(),true);}catch{}};
$('statementTab').onclick=()=>{showBook(false);try{writeLocal('bookMode:'+namespace(),false);}catch{}};
$('fold').onclick=()=>{$('workspace').classList.add('folded');$('unfold').hidden=false;prefs.folded=true;remember();editor.layout();};
$('unfold').onclick=()=>{$('workspace').classList.remove('folded');$('unfold').hidden=true;prefs.folded=false;remember();editor.layout();};
function ratio(value) { prefs.ratio=Math.max(20,Math.min(75,value));document.documentElement.style.setProperty('--left',prefs.ratio+'%');$('splitter').setAttribute('aria-valuenow',String(Math.round(prefs.ratio)));editor.layout(); }
function bindDrag(element, move, done) {
  element.onpointerdown=event=>{
    if(event.button!==0||event.target.closest('button'))return;event.preventDefault();element.setPointerCapture(event.pointerId);document.body.classList.add('dragging');
    const change=e=>move(e),finish=()=>{element.removeEventListener('pointermove',change);element.removeEventListener('pointerup',finish);element.removeEventListener('pointercancel',finish);document.body.classList.remove('dragging');done();};
    element.addEventListener('pointermove',change);element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',finish);
  };
}
bindDrag($('splitter'),event=>{if(prefs.folded)return;const rect=$('workspace').getBoundingClientRect();ratio((event.clientX-rect.left)/rect.width*100);},remember);
$('splitter').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();ratio(event.key==='Home'?43:prefs.ratio+(event.key==='ArrowLeft'?-2:2));remember();}};
function consoleHeight(value) { prefs.consoleHeight=Math.max(90,Math.min($('workspace').clientHeight*.65,value));document.documentElement.style.setProperty('--console',prefs.consoleHeight+'px');editor.layout(); }
bindDrag($('outputSplitter'),event=>{const rect=$('workspace').getBoundingClientRect();$('console').classList.remove('collapsed');consoleHeight(rect.bottom-event.clientY-52);},remember);
$('outputSplitter').onkeydown=event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();consoleHeight(prefs.consoleHeight+(event.key==='ArrowUp'?20:-20));remember();}};
$('toggleConsole').onclick=()=>{$('console').classList.toggle('collapsed');editor.layout();};
$('theme').onclick=()=>{prefs.theme=prefs.theme==='vs-dark'?'vs':'vs-dark';monaco.editor.setTheme(prefs.theme);document.body.classList.toggle('light-editor',prefs.theme==='vs');remember();};
$('fontSize').value=prefs.font;$('fontSize').onchange=()=>{prefs.font=Number($('fontSize').value);editor.updateOptions({fontSize:prefs.font});remember();};
$('language').onchange=()=>{const language=languageInfo();setEditor(language);try{writeLocal('language:'+state.origin,language.id);}catch{}};
$('course').onchange=()=>guard(()=>selectCourse($('course').value));$('contest').onchange=()=>guard(()=>selectContest($('contest').value));
$('previous').onclick=()=>guard(()=>selectProblem(state.problems[state.problems.findIndex(p=>p.id===state.problem.id)-1].id));
$('next').onclick=()=>guard(()=>selectProblem(state.problems[state.problems.findIndex(p=>p.id===state.problem.id)+1].id));
$('restore').onclick=()=>guard(()=>restoreCode());$('run').onclick=runCode;$('sample').onclick=()=>submit(true);$('submit').onclick=()=>submit(false);
$('runTab').onclick=()=>setConsole('run');$('resultTab').onclick=()=>setConsole('result');$('historyTab').onclick=()=>guard(async()=>{setConsole('history');await refreshHistory();});
$('clearOutput').onclick=()=>{$('stdout').textContent='';$('runInfo').textContent='';};
$('refresh').onclick=()=>guard(async()=>{if(submitting)return;const selected=readLocal('navigation:'+state.origin,{});await loadHome('/index.php/judge');});
$('close').onclick=()=>{saveDraft();haltPoll();stopRun(null);if(!preview)parent.postMessage({channel:'ok-oj',type:'close'},state.origin);};
function setSidebar(open) {
  prefs.sidebarOpen=open;$('appBody').classList.toggle('sidebar-closed',!open);$('sidebarToggle').setAttribute('aria-expanded',String(open));$('sidebarToggle').title=open?'강좌 목록 접기':'강좌 목록 펼치기';$('sidebar').hidden=!open;$('sidebarBackdrop').hidden=!open;remember();editor.layout();
}
$('sidebarToggle').onclick=()=>setSidebar(!prefs.sidebarOpen);$('sidebarClose').onclick=$('sidebarBackdrop').onclick=()=>setSidebar(false);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&innerWidth<800&&prefs.sidebarOpen)setSidebar(false);});
window.addEventListener('pagehide',()=>{saveDraft();runWorker?.terminate();if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);});
async function guard(action) { try { await action(); } catch(error) { if(error.message!=='cancelled')notice(error.message,true); } }
ratio(prefs.ratio);consoleHeight(prefs.consoleHeight);document.body.classList.toggle('light-editor',prefs.theme==='vs');if(prefs.folded){$('workspace').classList.add('folded');$('unfold').hidden=false;}updateButtons();
setSidebar(prefs.sidebarOpen??innerWidth>=800);
guard(async()=>{const path=await connect();$('hostLabel').textContent=preview?'미리보기':state.origin.includes('ex-')?'EX-OJ':'OJ';await loadHome(path);});
