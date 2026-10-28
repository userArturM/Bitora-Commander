'use strict';
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile),C=require('./core');
async function powershell(script,args=[]){if(process.platform!=='win32')return null;return (await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script,...args],{windowsHide:true,maxBuffer:32*1024*1024})).stdout.trim();}
// User paths are encoded as Base64 data, never interpolated as PowerShell source.
const literal=p=>`([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(C.absolute(p)).toString('base64')}')))`;
async function attributes(dir){const out=await powershell(`$p=${literal(dir)}; @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | ForEach-Object { @{name=$_.Name;hidden=[bool]($_.Attributes -band 2);system=[bool]($_.Attributes -band 4)} }) | ConvertTo-Json -Compress`);if(!out)return [];const a=JSON.parse(out);return Array.isArray(a)?a:[a];}
async function properties(p){await powershell(`$p=${literal(p)}; $s=New-Object -ComObject Shell.Application; $f=$s.Namespace([IO.Path]::GetDirectoryName($p)); $i=$f.ParseName([IO.Path]::GetFileName($p)); $i.InvokeVerb('properties'); Start-Sleep -Seconds 2`);}
async function openWith(p){await powershell(`$p=${literal(p)}; Start-Process -FilePath "$env:SystemRoot\\System32\\rundll32.exe" -ArgumentList ('shell32.dll,OpenAs_RunDLL "'+$p+'"')`);}
module.exports={attributes,properties,openWith};
