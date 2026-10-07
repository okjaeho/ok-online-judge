import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('pdf.worker.mjs',location.href).href;
let documentTask,documentPromise,renderTask,sequence=0;
export async function loadPdf(blob) {
  const id=++sequence;
  renderTask?.cancel();await documentTask?.destroy();
  if(id!==sequence)return;
  documentTask=null;documentPromise=null;
  if(!blob)return 0;
  const data=new Uint8Array(await blob.arrayBuffer());if(id!==sequence)return;
  documentTask=getDocument({data,isEvalSupported:false,useSystemFonts:true,
    cMapUrl:new URL('pdf/cmaps/',location.href).href,cMapPacked:true,
    standardFontDataUrl:new URL('pdf/standard_fonts/',location.href).href,
    wasmUrl:new URL('pdf/wasm/',location.href).href});
  documentPromise=documentTask.promise;
  return (await documentPromise).numPages;
}
export async function drawPdf(host,number,zoom='fit') {
  const id=sequence;if(!documentPromise)return;
  const doc=await documentPromise;if(id!==sequence)return;
  const page=await doc.getPage(Math.max(1,Math.min(number,doc.numPages)));if(id!==sequence)return;
  renderTask?.cancel();
  const canvas=document.createElement('canvas'),base=page.getViewport({scale:1});
  const scale=zoom==='fit'?Math.max(.2,(host.clientWidth-24)/base.width):Number(zoom)/100;
  const viewport=page.getViewport({scale}),density=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);
  canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';canvas.setAttribute('aria-label','교재 '+number+'페이지');
  host.replaceChildren(canvas);
  renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density===1?null:[density,0,0,density,0,0]});
  try {await renderTask.promise;} catch(error) {if(error.name!=='RenderingCancelledException')throw error;}
}
