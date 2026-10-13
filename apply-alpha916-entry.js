'use strict';
const fs=require('fs');
const path=require('path');
const Module=require('module');
const target=path.join(__dirname,'apply-alpha916.js');
let code=fs.readFileSync(target,'utf8');
code=code.replace('\\${heavyBody}','${heavyBody}');
if(code.includes('\\${heavyBody}'))throw new Error('Alpha 9.16: template heavyBody não normalizado');
const mod=new Module(target,module);mod.filename=target;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(code,target);
