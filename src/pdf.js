import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist/build/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('pdf.worker.mjs',location.href).href;
let documentTask,documentPromise,sequence=0,view;

function selectedPage(entry) {
  const selection=window.getSelection();
  if(!selection||selection.isCollapsed||!selection.rangeCount)return false;
  try{return selection.getRangeAt(0).intersectsNode(entry.element);}catch{return false;}
}
function clearCanvas(entry,keepText=false) {
  const canvas=entry.canvas;entry.canvas=null;entry.task?.cancel();canvas?.remove();
  const pending=[entry.task?.promise,entry.textPromise];
  if(!keepText){entry.textLayer?.cancel();entry.textElement?.remove();entry.textLayer=null;entry.textElement=null;entry.textPromise=null;}
  Promise.allSettled(pending).then(()=>{if(canvas){canvas.width=0;canvas.height=0;}if(!entry.canvas&&!entry.textLayer)entry.page.cleanup();});
  entry.task=null;
}
function disposeView() {
  if(!view)return;
  view.host.removeEventListener('scroll',view.onScroll);document.removeEventListener('selectionchange',view.onScroll);cancelAnimationFrame(view.tick);
  for(const entry of view.entries)clearCanvas(entry);
  view=null;
}
export async function loadPdf(blob) {
  const id=++sequence,previous=documentTask;disposeView();documentTask=null;documentPromise=null;
  await previous?.destroy();if(id!==sequence)return 0;
  if(!blob)return 0;
  const data=new Uint8Array(await blob.arrayBuffer());if(id!==sequence)return 0;
  documentTask=getDocument({data,isEvalSupported:false,useSystemFonts:true,
    cMapUrl:new URL('pdf/cmaps/',location.href).href,cMapPacked:true,
    standardFontDataUrl:new URL('pdf/standard_fonts/',location.href).href,
    wasmUrl:new URL('pdf/wasm/',location.href).href});
  documentPromise=documentTask.promise;
  try {const doc=await documentPromise;return id===sequence?doc.numPages:0;}
  catch(error){if(id===sequence)throw error;return 0;}
}
function currentPosition(active) {
  const marker=active.host.scrollTop+Math.min(80,active.host.clientHeight/3);
  let entry=active.entries[0];
  for(const candidate of active.entries){if(candidate.element.offsetTop>marker)break;entry=candidate;}
  return entry?{page:entry.number,offset:Math.max(0,Math.min(1,(active.host.scrollTop-entry.element.offsetTop)/entry.viewport.height))}:{page:1,offset:0};
}
function scrollToPage(active,number,offset=0) {
  const entry=active.entries[Math.max(0,Math.min(active.entries.length-1,(Math.floor(number)||1)-1))];
  if(entry)active.host.scrollTop=Math.max(0,entry.element.offsetTop+entry.viewport.height*offset-12);
}
function renderNearby(active) {
  if(view!==active||active.id!==sequence)return;
  const top=active.host.scrollTop,bottom=top+active.host.clientHeight,margin=active.host.clientHeight;
  const position=currentPosition(active);
  if(position.page!==active.currentPage){active.currentPage=position.page;active.onPageChange?.(position.page);}
  for(const entry of active.entries) {
    const near=entry.element.offsetTop+entry.viewport.height>=top-margin&&entry.element.offsetTop<=bottom+margin;
    if(!near){if(entry.canvas||entry.textElement)clearCanvas(entry,selectedPage(entry));continue;}
    if(entry.canvas)continue;
    const canvas=document.createElement('canvas'),area=entry.viewport.width*entry.viewport.height;
    const density=Math.min(devicePixelRatio||1,2,Math.sqrt(4_000_000/area));
    canvas.width=Math.ceil(entry.viewport.width*density);canvas.height=Math.ceil(entry.viewport.height*density);
    canvas.style.width='100%';canvas.style.height='100%';canvas.setAttribute('aria-label','교재 '+entry.number+'페이지');
    entry.canvas=canvas;entry.element.append(canvas);
    if(!entry.textLayer) {
      const layer=document.createElement('div');layer.className='pdf-text-layer';layer.style.setProperty('--total-scale-factor',entry.viewport.scale);
      entry.element.append(layer);entry.textElement=layer;
      const textLayer=new TextLayer({textContentSource:entry.page.streamTextContent({includeMarkedContent:true}),container:layer,viewport:entry.viewport});
      entry.textLayer=textLayer;entry.textPromise=textLayer.render().catch(()=>{});
    }
    const task=entry.page.render({canvasContext:canvas.getContext('2d'),viewport:entry.viewport,transform:density===1?null:[density,0,0,density,0,0]});entry.task=task;
    task.promise.catch(error=>{
      if(error.name!=='RenderingCancelledException'&&view===active&&entry.canvas===canvas){
        const warning=document.createElement('span');warning.className='pdf-page-error';warning.textContent='페이지를 표시하지 못했습니다.';entry.element.append(warning);
      }
    }).finally(()=>{if(entry.task===task)entry.task=null;});
  }
}
export async function drawPdf(host,number,zoom='fit',onPageChange,options={}) {
  const id=sequence;if(!documentPromise||!host.clientWidth||!host.clientHeight)return;
  let doc;try{doc=await documentPromise;}catch(error){if(id===sequence)throw error;return;}
  if(id!==sequence)return;
  const width=host.clientWidth;
  if(view?.id===id&&view.host===host&&view.zoom===zoom&&view.width===width) {
    view.onPageChange=onPageChange;
    if(!view.ready){if(!options.preservePosition)view.targetPage=number;return;}
    if(!options.preservePosition)scrollToPage(view,number);
    renderNearby(view);return;
  }
  const previous=options.preservePosition&&view?.id===id&&view.ready?currentPosition(view):null;
  disposeView();
  const pages=document.createElement('div');pages.className='pdf-pages';
  const active={id,host,width,zoom,entries:[],onPageChange,currentPage:null,targetPage:number,ready:false,tick:0};view=active;
  active.onScroll=()=>{cancelAnimationFrame(active.tick);active.tick=requestAnimationFrame(()=>renderNearby(active));};
  host.replaceChildren(pages);
  for(let n=1;n<=doc.numPages;n++) {
    let page;try{page=await doc.getPage(n);}catch(error){if(view!==active||id!==sequence)return;throw error;}
    if(view!==active||id!==sequence)return;
    const base=page.getViewport({scale:1});
    const scale=zoom==='fit'?Math.max(.2,(width-24)/base.width):Math.max(.2,(Number(zoom)||100)/100);
    const viewport=page.getViewport({scale}),element=document.createElement('div');
    element.className='pdf-page';element.dataset.page=String(n);element.setAttribute('role','group');element.setAttribute('aria-label','교재 '+n+'페이지');
    element.style.width=viewport.width+'px';element.style.height=viewport.height+'px';pages.append(element);
    active.entries.push({number:n,page,viewport,element,canvas:null,task:null});
  }
  if(view!==active||id!==sequence)return;
  // A short final page must still be reachable by page number at the top.
  pages.style.paddingBottom=Math.max(0,host.clientHeight-active.entries.at(-1).viewport.height-24)+'px';
  active.ready=true;host.addEventListener('scroll',active.onScroll,{passive:true});document.addEventListener('selectionchange',active.onScroll);
  scrollToPage(active,previous?.page||active.targetPage,previous?.offset||0);renderNearby(active);
}
