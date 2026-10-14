'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const file=path.join(root,'shiny-telemetry.js');
let src=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
function once(from,to,label){if(!src.includes(from))throw new Error('Alpha 10.3 save patch anchor missing: '+label);src=src.replace(from,to);}
once(
"    this.lastLog = 0;\n    this.cached = null;",
"    this.lastLog = 0;\n    this.lastSavedAt = 0;\n    this.minSaveInterval = 60_000;\n    this.cached = null;",
'constructor throttle state');
// Shiny rolls and explicit preference changes remain immediately durable.
src=src.replaceAll('void this.save();','void this.save(true);');
once('  async save() {','  async save(force = false) {','save signature');
once(
"    if (!this.file || this.readOnly || (!this.dirty && !this.saving)) return this.saving;\n    if (this.saving) { this.saveAgain = true; return this.saving; }",
"    if (!this.file || this.readOnly || (!this.dirty && !this.saving)) return this.saving;\n    if (this.saving) { this.saveAgain = true; return this.saving; }\n    if (!force && this.lastSavedAt && this.clock() - this.lastSavedAt < this.minSaveInterval) return null;",
'throttle guard');
once(
"          await fs.promises.rename(this.file + '.tmp', this.file);\n          this.error = null;",
"          await fs.promises.rename(this.file + '.tmp', this.file);\n          this.lastSavedAt = this.clock();\n          this.error = null;",
'save timestamp');
once(
"  async close() {\n    await this.save();\n    while (this.saving) await this.saving;\n    if (this.dirty) await this.save();\n  }",
"  async close() {\n    await this.save(true);\n    while (this.saving) await this.saving;\n    if (this.dirty) await this.save(true);\n  }",
'forced close');
fs.writeFileSync(file,src);
console.log('Alpha 10.3: Shiny persistence throttled; rolls/config/close remain immediate');
