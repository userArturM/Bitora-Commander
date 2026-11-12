'use strict';
// Release gate checks required files, lockfile consistency and CI stages.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const packageData=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
assert.match(packageData.version,/^\d+\.\d+\.\d+$/,'stable version must be semver');
assert.equal(lock.version,packageData.version,'lockfile top version must match release');
assert.equal(lock.packages[''].version,packageData.version,'lockfile package version must match release');
const required=['archive-plus.js','archive-workspace.js','remote-transfer.js','network-files.js','partial-store.js','resume-local.js','search-sync.js','qa/functional.cjs','qa/stress-directories.cjs','qa/stress-transfers.cjs','RELEASE_NOTES.md','RELEASE_GATE_3.0.md','LICENSE'];
for(const file of required)assert.ok(fs.statSync(path.join(root,file)).size>100,file+' must exist and not be empty');
const wf=read('.github/workflows/windows.yml');
for(const expected of ['npm test','stress-directories.cjs','stress-transfers.cjs','Native application functional tests','Packaged and portable functional tests','Installer functional test','Checksums','Publish release','SHA256SUMS.txt'])assert.ok(wf.includes(expected),'CI missing '+expected);
assert.ok(read('RELEASE_NOTES.md').includes(packageData.version),'release notes must match current version');
assert.ok(!packageData.build?.publish,'auto-publishing by electron-builder should remain disabled');
console.log('RELEASE GATE OK: '+packageData.version+'; lockfile, source, QA, installer, portable, SHA-256 publication');
