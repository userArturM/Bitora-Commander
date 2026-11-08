'use strict';
(function(root){
 function glob(pattern){return new RegExp('^'+String(pattern).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$','iu');}
 function matches(name,query){if(!query)return true;const terms=String(query).split(/[;,]+/).map(t=>t.trim()).filter(Boolean),include=terms.filter(t=>!t.startsWith('!')),exclude=terms.filter(t=>t.startsWith('!')).map(t=>t.slice(1));const test=t=>/[?*]/.test(t)?glob(t).test(name):name.toLocaleLowerCase().includes(t.toLocaleLowerCase());return (!include.length||include.some(test))&&!exclude.some(test);}
 const api={glob,matches};if(typeof module!=='undefined')module.exports=api;else root.commanderModel=api;
})(globalThis);
