'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const target=path.join(__dirname,'alpha1183-apply.js');
let src=fs.readFileSync(target,'utf8');

// alpha1183-apply.js generates hunt-visual.js from an outer template literal.
// Keep the inner "Carregar mais" expression literal until the generated UI runs;
// otherwise the patch runner evaluates `hunts` while assembling the build.
const interpolationBug='Carregar mais (${Math.min(24,hunts.length-limit)})';
const interpolationFix="Carregar mais (${'${'}Math.min(24,hunts.length-limit)})";
const interpolationHits=src.split(interpolationBug).length-1;
if(interpolationHits!==1)throw new Error('Alpha 11.8.3 safe apply: progressive Hunt interpolation baseline expected once, got '+interpolationHits);
src=src.replace(interpolationBug,interpolationFix);

// The 11.8.2 renderer still carries the old scheduleRender() continuous-rAF
// helper. Alpha 11.8.3 switches render() to HuntRenderScheduler, so remove the
// dead helper as part of the patch instead of merely leaving an unreachable loop.
const renderPatch="ui=replaceFunction(ui,'render',`function render(state,data){ctx.state=state;ctx.data=data;if(ctx.visible)ensureScheduler().request();}`);";
const renderPatchHits=src.split(renderPatch).length-1;
if(renderPatchHits!==1)throw new Error('Alpha 11.8.3 safe apply: render patch anchor expected once, got '+renderPatchHits);
src=src.replace(renderPatch,"ui=replaceFunction(ui,'scheduleRender','');\n"+renderPatch);

const needle=/function replaceFunction\(text,name,replacement\)\{const b=functionBounds\(text,name\);return text\.slice\(0,b\.start\)\+replacement\+text\.slice\(b\.end\);\}/;
if(!needle.test(src))throw new Error('Alpha 11.8.3 safe apply: replaceFunction baseline not found exactly once');
const replacement=`function replaceFunction(text,name,replacement){
  const ends={top:'  function cardHtml(',cardHtml:'  function renderOverview(',renderOverview:'  function ivHtml(',compareHtml:'  function individualHtml(',renderIndividual:'  function renderNow(',scheduleRender:'  function render(',render:'  function setVisible(',setVisible:'  window.HuntVisual='};
  const startToken='  function '+name+'(';
  const endToken=ends[name];
  if(!endToken)throw new Error('Alpha 11.8.3 safe apply: unsupported function '+name);
  const start=text.indexOf(startToken);
  if(start<0||text.indexOf(startToken,start+startToken.length)>=0)throw new Error('Alpha 11.8.3 safe apply: '+name+' start anchor missing/not unique');
  const end=text.indexOf(endToken,start+startToken.length);
  if(end<0)throw new Error('Alpha 11.8.3 safe apply: '+name+' end anchor missing');
  const body=replacement.startsWith('  ')?replacement:'  '+replacement;
  return text.slice(0,start)+body+'\\n'+text.slice(end);
}`;
src=src.replace(needle,replacement);
if(needle.test(src))throw new Error('Alpha 11.8.3 safe apply: old replaceFunction still present');
const mod=new Module(target,module);
mod.filename=target;
mod.paths=Module._nodeModulePaths(__dirname);
mod._compile(src,target);
