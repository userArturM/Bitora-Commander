'use strict';
(function(root){
 function breadcrumbs(value){if(typeof value!=='string'||!value)return [];const windows=/^[A-Za-z]:[\\/]|^\\\\/.test(value),sep=windows?'\\':'/',p=windows?value.replaceAll('/','\\'):value;let base='',rest='';if(p.startsWith('\\\\')){const parts=p.slice(2).split('\\').filter(Boolean);if(parts.length<2)return [{label:p,path:p}];base='\\\\'+parts.shift()+'\\'+parts.shift()+'\\';rest=parts.join('\\');}else if(windows){base=p.slice(0,3);rest=p.slice(3);}else{base='/';rest=p.replace(/^\/+/,'');}const out=[{label:base,path:base}];for(const part of rest.split(sep).filter(Boolean)){base=base.endsWith(sep)?base+part:base+sep+part;out.push({label:part,path:base});}return out;}
 function queueProgress(p){if(!p||!Number.isFinite(p.total)||p.total<=0)return null;return Math.min(100,Math.max(0,Math.floor((p.completed||0)/p.total*100)));}
 const model={breadcrumbs,queueProgress};if(typeof module!=='undefined'&&module.exports)module.exports=model;else root.uiModel=model;
})(typeof window==='undefined'?globalThis:window);
