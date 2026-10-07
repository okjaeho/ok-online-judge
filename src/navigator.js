export function createNavigator({host,loadContests,loadProblems,onSelect,onError,onOpened}) {
  let courses=[],opened=new Set(),generation=0,revealId=0,current;
  const courseLoads=new Map(),problemLoads=new Map(),courseNodes=new Map(),contestNodes=new Map();
  const contestKey=(course,contest)=>course.id+':'+contest.id;
  function cached(map,key,load) {
    if(!map.has(key))map.set(key,load().catch(error=>{map.delete(key);throw error;}));
    return map.get(key);
  }
  const getContests=course=>cached(courseLoads,course.id,()=>loadContests(course));
  const getProblems=(course,contest)=>cached(problemLoads,contestKey(course,contest),()=>loadProblems(contest));
  function folder(label,path,kind,fill) {
    const details=document.createElement('details'),summary=document.createElement('summary'),icon=document.createElement('span'),title=document.createElement('span'),children=document.createElement('div');
    details.className='nav-folder '+kind;summary.title=label;icon.className='folder-icon';icon.setAttribute('aria-hidden','true');title.textContent=label;summary.append(icon,title);children.className='nav-children';details.append(summary,children);
    let pending;
    const ensure=()=>{
      if(pending)return pending;
      const loading=document.createElement('span');loading.className='nav-empty';loading.textContent='불러오는 중…';children.replaceChildren(loading);
      return pending=fill(children).catch(error=>{pending=null;children.replaceChildren();const retry=document.createElement('button');retry.className='nav-retry';retry.textContent='다시 불러오기';retry.onclick=()=>ensure().catch(onError);children.append(retry);throw error;});
    };
    details.addEventListener('toggle',()=>{
      if(!details.isConnected)return;
      if(details.open){opened.add(path);ensure().catch(onError);}else opened.delete(path);
      onOpened([...opened]);
    });
    details.open=opened.has(path);
    return {details,children,ensure};
  }
  function mark() {
    for(const button of host.querySelectorAll('.nav-problem')) {
      const selected=button.dataset.key===current;
      button.classList.toggle('selected',selected);
      if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    for(const [id,node] of courseNodes)node.details.classList.toggle('active-branch',current?.startsWith(id+':'));
  }
  function reset(list,expanded=[]) {
    generation++;revealId++;courses=list;opened=new Set(expanded);current=null;courseLoads.clear();problemLoads.clear();courseNodes.clear();contestNodes.clear();host.replaceChildren();
    const revision=generation;
    for(const course of courses) {
      const node=folder(course.title,'course:'+course.id,'nav-course',async children=>{
        const contests=await getContests(course);if(revision!==generation)return;
        children.replaceChildren();
        for(const contest of contests) {
          const key=contestKey(course,contest);
          const child=folder(contest.title,'contest:'+key,'nav-contest',async container=>{
            const problems=await getProblems(course,contest);if(revision!==generation)return;
            container.replaceChildren();
            for(const problem of problems) {
              const button=document.createElement('button'),name=document.createElement('span'),score=document.createElement('span');
              button.className='nav-problem';button.dataset.key=key+':'+problem.id;button.title=problem.title+(problem.score?' · '+problem.score:'');
              name.textContent=(problem.number?problem.number+'. ':'')+problem.title;score.className='nav-score';score.classList.toggle('passed',/^100\s*\//.test(problem.score));score.setAttribute('aria-hidden','true');button.append(name,score);
              button.onclick=()=>Promise.resolve(onSelect(course,contest,problem)).catch(onError);container.append(button);
            }
            if(!problems.length){const blank=document.createElement('span');blank.className='nav-empty';blank.textContent='공개된 문제가 없습니다.';container.append(blank);}
            mark();
          });
          contestNodes.set(key,child);children.append(child.details);
        }
        if(!contests.length){const blank=document.createElement('span');blank.className='nav-empty';blank.textContent='문제 탭이 없습니다.';children.append(blank);}
      });
      courseNodes.set(course.id,node);host.append(node.details);
    }
  }
  async function reveal(course,contest,problem) {
    const ticket=++revealId;current=contestKey(course,contest)+':'+problem.id;mark();
    const parent=courseNodes.get(course.id);if(!parent)return;parent.details.open=true;await parent.ensure();if(ticket!==revealId)return;
    const child=contestNodes.get(contestKey(course,contest));if(!child)return;child.details.open=true;await child.ensure();if(ticket!==revealId)return;mark();
  }
  return {reset,getContests,getProblems,reveal};
}
