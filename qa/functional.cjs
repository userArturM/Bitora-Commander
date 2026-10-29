const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
module.exports=async({win,app,C})=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"Bitora 'Тест' #100%-")),left=path.join(root,'Слева'),right=path.join(root,'Справа');
 const js=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(e){throw Error(code.slice(0,200)+': '+String(e));}};
 const wait=async code=>{for(let i=0;i<200;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+code+'; '+await js('JSON.stringify({notice:document.getElementById("notice").textContent,width:innerWidth,previewHidden:document.getElementById("previewPanel").hidden,previewHint:document.getElementById("previewHint").textContent,previewName:document.getElementById("previewName").textContent,previewText:document.getElementById("previewText").textContent,active,selected:panes[active]&&[...panes[active].selection]})'));};
 try{await fs.mkdir(left);await fs.mkdir(right);await fs.writeFile(path.join(left,'Тест.txt'),'hello');await js('window.workReady||window.ready');await js(`Promise.all([navigate(0,${JSON.stringify(left)}),navigate(1,${JSON.stringify(right)})])`);assert.equal(await js('panes[0].items.length'),1);await js('setActive(0);panes[0].selection.add(panes[0].items[0].path);renderRows(0);run("copy");void 0');await wait('document.getElementById("confirmDialog").open');await js('document.getElementById("confirmOK").click()');await wait('!busy&&panes[1].items.some(f=>f.name==="Тест.txt")');assert.equal(await fs.readFile(path.join(right,'Тест.txt'),'utf8'),'hello');await js('panes[0].selection.add(panes[0].items[0].path);view(true)');await js('document.getElementById("viewerText").value="edited";document.getElementById("viewerSave").click()');await wait('document.getElementById("editorHint").textContent.startsWith("Сохранено")');assert.equal(await fs.readFile(path.join(left,'Тест.txt'),'utf8'),'edited');await js('closeViewer();newTab(0)');assert.equal(await js('panes[0].tabs.length'),2);await js('closeTab(0,1)');
 const zip=path.join(left,'Архив.zip');await js(`api.archive([${JSON.stringify(path.join(left,'Тест.txt'))}],${JSON.stringify(zip)})`);const extracted=await js(`api.extract(${JSON.stringify(zip)},${JSON.stringify(right)})`);assert.equal(await fs.readFile(path.join(extracted,'Тест.txt'),'utf8'),'edited');const results=await js(`api.search(${JSON.stringify(root)},"Тест.txt")`);assert.equal(results.results.length,3);
 await js(`api.mkdir(${JSON.stringify(left)},"Новая папка")`);await js(`api.rename(${JSON.stringify(path.join(left,'Новая папка'))},"Переименована")`);await js('refresh()');assert.ok(await C.exists(path.join(left,'Переименована')));

 // New release: exercise native clipboard, shell icons, watcher and 7-Zip inside packaged apps.
 await js(`api.fileClipboard([${JSON.stringify(path.join(left,'Тест.txt'))}],false)`);
 const {clipboard,safeStorage}=require('electron');const clip=await clipboard.read();assert.ok(clip.some(i=>i.types.includes('text/uri-list')));
 const icon=await js(`api.icons([${JSON.stringify(path.join(left,'Тест.txt'))}])`);assert.ok(icon[0].url.startsWith('data:image/'));
 const protectedValue=await safeStorage.encryptStringAsync('test-password');assert.equal((await safeStorage.decryptStringAsync(protectedValue)).result,'test-password');
 await js('api.watch(panes.map(p=>p.path))');await fs.writeFile(path.join(left,'watch-test.txt'),'watch');await wait('panes[0].items.some(f=>f.name==="watch-test.txt")');
 const seven=path.join(left,'test.7z');const archiveJob=await js(`api.archiveCreate([${JSON.stringify(path.join(left,'Тест.txt'))}],${JSON.stringify(seven)})`);
 await wait(`taskItems.some(t=>t.id===${JSON.stringify(archiveJob)}&&['done','failed'].includes(t.status))`);assert.equal(await js(`taskItems.find(t=>t.id===${JSON.stringify(archiveJob)}).status`),'done');
 const entries=await js(`api.archiveList(${JSON.stringify(seven)})`);assert.ok(entries.some(e=>e.name==='Тест.txt'));
 const extractJob=await js(`api.archiveExtract(${JSON.stringify(seven)},${JSON.stringify(right)},['Тест.txt'])`);await wait(`taskItems.some(t=>t.id===${JSON.stringify(extractJob)}&&['done','failed'].includes(t.status))`);assert.equal(await fs.readFile(path.join(right,'test — распаковано','Тест.txt'),'utf8'),'edited');
 const advanced=await js(`api.searchAdvanced(${JSON.stringify(left)},'Тест',{extensions:'txt',content:'edited'})`);assert.equal(advanced.results.length,1);
 await js('api.watch([])');

 // Verify the redesigned workspace with real Electron IPC and file contents.
 win.setContentSize(1360,850);await wait('innerWidth>=1100');
 await js(`setActive(0);panes[0].selection=new Set([panes[0].items.find(f=>f.name==='Тест.txt').path]);previewRequested=true;applyPreviewLayout();renderRows(0);void 0`);
 await wait('!document.getElementById("previewText").hidden&&document.getElementById("previewText").textContent==="edited"');
 const png=path.join(left,'preview.png'),{nativeImage}=require('electron');await fs.writeFile(png,nativeImage.createFromBitmap(Buffer.alloc(16,180),{width:2,height:2}).toPNG());await js('refresh()');await js(`panes[0].selection=new Set([panes[0].items.find(f=>f.name==='preview.png').path]);renderRows(0);void 0`);
 await wait('!document.getElementById("previewImage").hidden&&document.getElementById("previewImage").naturalWidth===2');
 assert.equal(await js('getComputedStyle(document.getElementById("queuePanel")).position'),'static');
 assert.equal(await js('document.getElementById("panes").getBoundingClientRect().bottom<=document.getElementById("queuePanel").getBoundingClientRect().top+1'),true);
 await js('document.querySelector(".command-menu summary").click()');await wait('document.querySelector(".command-menu").open');await js('closeMenus()');
 await js('editPath(0)');assert.equal(await js('panes[0].root.classList.contains("edit-path")'),true);await js('panes[0].root.classList.remove("edit-path")');
 win.setContentSize(900,600);await wait('document.getElementById("previewPanel").hidden');assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);win.setContentSize(1360,850);
 // Folder display and navigation regressions with actual Windows entries.
 await js('api.watch([])');
 await js(`navigate(0,${JSON.stringify(left)})`);
 await wait('panes[0].body.querySelector(".file-icon.folder svg")!==null');
 const folderPath=await js('panes[0].items.find(f=>f.name==="Переименована").path');
 await fs.writeFile(path.join(folderPath,'внутри.txt'),'nested');
 await js('panes[0].filterInput.value="Переименована";panes[0].filterInput.dispatchEvent(new Event("input"));void 0');
 const point=await js('(()=>{const r=panes[0].body.querySelector("tr[title]").getBoundingClientRect();return {x:Math.round(r.x+45),y:Math.round(r.y+r.height/2)};})()');
 for(const count of [1,2]){win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:count,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:count,...point});await new Promise(r=>setTimeout(r,100));}
 await wait('panes[0].items.some(f=>f.name==="внутри.txt")');
 assert.equal(await js('panes[0].filterInput.value'),'');
 assert.equal(await js('panes[0].body.querySelectorAll("tr[title]").length'),1);
 await js(`navigate(0,${JSON.stringify(left)})`);
 await js('panes[0].selection=new Set([panes[0].items.find(f=>f.name==="Тест.txt").path]);renderRows(0);panes[0].filterInput.value="Переименована";panes[0].filterInput.dispatchEvent(new Event("input"));void 0');
 assert.equal(await js('selected(panes[0]).length'),0);
 await js('panes[0].filterInput.value="";panes[0].filterInput.dispatchEvent(new Event("input"));void 0');
 await js('api.watch([])');
 // Workbench: exercise actual filesystem tools and their dialogs.
 const toolsRoot=path.join(root,'Инструменты');await fs.mkdir(toolsRoot);await fs.writeFile(path.join(toolsRoot,'old-a.txt'),'identical');await fs.writeFile(path.join(toolsRoot,'old-b.txt'),'identical');
 await js(`navigate(0,${JSON.stringify(toolsRoot)})`);await js('setActive(0);panes[0].selection=new Set(panes[0].items.map(f=>f.path));renderRows(0);run("renameMany");void 0');
 await wait('document.getElementById("renameManyDialog").open');await js('document.getElementById("renameTemplate").value="Item_{n}{ext}";document.getElementById("renamePreview").click()');await wait('!document.getElementById("renameApply").disabled');await js('document.getElementById("renameApply").click()');await wait('document.getElementById("renameStatus").textContent.startsWith("Переименовано: 2")');assert.equal(await fs.readFile(path.join(toolsRoot,'Item_001.txt'),'utf8'),'identical');await js('document.getElementById("renameManyDialog").close()');
 const sizes=await js(`api.folderSizes([${JSON.stringify(toolsRoot)}])`);assert.equal(sizes[0].bytes,18);assert.equal(sizes[0].files,2);
 await js('run("duplicates");void 0');await wait('!scanning&&document.querySelectorAll(".duplicate-file").length===2');assert.equal(await js('document.querySelectorAll(".duplicate-file input:checked").length'),0);
 await assert.rejects(js('api.duplicateTrash(duplicateGroups[0].files.map(f=>f.path))'),/оставить/);
 await js('document.getElementById("workScanDialog").close();run("columns");void 0');await js('document.querySelectorAll("#columnChoices input")[1].click()');assert.equal(await js('getComputedStyle(panes[0].body.closest("table").querySelectorAll("th")[1]).display'),'none');await js('document.getElementById("columnsReset").click()');
 const {dialog}=require('electron'),oldSave=dialog.showSaveDialog;const reportPath=path.join(root,'diagnostics.json');try{dialog.showSaveDialog=async()=>({canceled:false,filePath:reportPath});await js('api.reportError("QA diagnostic entry")');await js('api.diagnostics()');const report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.ok(report.errors.some(e=>e.message==='QA diagnostic entry'));assert.equal(report.version,app.getVersion());}finally{dialog.showSaveDialog=oldSave;}
 await js('api.watch([])');
 const foreign=await js('document.querySelectorAll(".pane").length');assert.equal(foreign,2);assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
 return {passed:true,checks:['native app startup','Cyrillic and special paths','two real directory panels','confirmed copy through UI','UTF-8 editor save through UI','tabs','ZIP create and extract via worker','recursive search','mkdir and rename','no horizontal overflow','native file clipboard','Windows shell icons','DPAPI protected password','live folder watcher','bundled 7-Zip create/list/selective extraction','advanced text search','inline UTF-8 preview','inline image preview','queue dock does not overlap file panels','grouped command menus','editable breadcrumb address','responsive narrow window','vector folder icons','real mouse double-click opens folder','filter resets between folders','filtered-out files excluded from operations','batch rename dialog and apply','recursive folder size','duplicate grouping and keep-one guard','column visibility','diagnostic export']};
 }finally{await fs.rm(root,{recursive:true,force:true});}
};
