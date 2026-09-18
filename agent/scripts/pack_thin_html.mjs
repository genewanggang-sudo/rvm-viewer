#!/usr/bin/env node
// 为 AIDT 工作区中的单个 .rvm 文件生成薄 HTML 交付件。
// 模型字节不进入 HTML；预览页将 media/... 相对路径解析为平台文件绝对 URL，
// 再交给 HTTPS viewer 的 RVM Worker/WASM 加载。

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VIEWER_URL = 'https://REPLACE-WITH-YOUR-VIEWER-HOST/'; // 由发布脚本配置副本，源码不改写

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--file-ref', '--name', '--output', '--viewer-url'].includes(key)) fail(`未知参数：${key}`);
    const value = argv[++index];
    if (!value) fail(`${key} 缺少值`);
    if (key === '--file-ref') args.fileRef = value;
    if (key === '--name') args.name = value;
    if (key === '--output') args.output = value;
    if (key === '--viewer-url') args.viewerUrl = value;
  }
  return args;
}

const THIN_HTML = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>RVM 查看器 — __TITLE__</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;height:100%;background:#101418;color:#dfe7ee;font:13px/1.5 system-ui,"Segoe UI",sans-serif}
#bar{position:fixed;inset:0 0 auto 0;display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(16,20,24,.92);border-bottom:1px solid #2b3540;z-index:5}
#st{flex:1;color:#8fa3b5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#st.ok{color:#59c98d}#st.bad{color:#e06c5a}
#retry{display:none;border:1px solid #3d4a57;background:#1b232b;color:#dfe7ee;border-radius:6px;padding:3px 12px;cursor:pointer}
#frame{position:fixed;inset:34px 0 0;width:100%;height:calc(100% - 34px);border:0;background:#101418}
</style></head><body>
<div id="bar"><span id="st">正在连接 RVM 查看器…</span><button id="retry" type="button">重试</button></div>
<iframe id="frame" src="about:blank" title="RVM 查看器" allow="fullscreen"></iframe>
<script>
(function(){
 'use strict';
 var VIEWER_URL = __VIEWER_URL__;
 var VIEWER_ORIGIN = "__VIEWER_ORIGIN__";
 var FILE_REF = __FILE_REF__;
 var NAME = __NAME__;
 var frame = document.getElementById('frame');
 var status = document.getElementById('st');
 var retry = document.getElementById('retry');
 var timer = null, done = false;

 function setStatus(text, style){ status.textContent = text; status.className = style || ''; }
 function htmlEscape(value){
   return String(value).replace(/[&<>"']/g, function(character){
     return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character];
   });
 }
 function resolveFileUrl(){
   var direct = new URL(FILE_REF, document.baseURI);
   if (direct.pathname.indexOf('/aidt2.1_api/api/v1/files/preview/') === 0) return direct.href;
   try {
     // AIDT srcdoc 有时没有注入 <base>。此时从配置页路径或普通聊天 query 的 agent id
     // 推导工作区文件预览地址；不把登录凭据或模型字节写入 HTML。
     var hostPage = new URL(window.top.location.href);
     var match = hostPage.pathname.match(new RegExp('/agents/([^/]+)'));
     var agentId = match ? match[1] : hostPage.searchParams.get('agent_id');
     if (agentId && /^[a-zA-Z0-9_-]+$/.test(agentId) && FILE_REF.indexOf('media/') === 0) {
       return new URL(
         '/aidt2.1_api/api/v1/files/preview/app/working/workspaces/' +
           encodeURIComponent(agentId) + '/' + FILE_REF,
         hostPage.origin
       ).href;
     }
   } catch (_) {}
   return direct.href;
 }
 async function load(){
   // 相对 media 路径必须在 AIDT srcdoc 预览页中解析，不能让外部 viewer 按自身域名解析。
   var viewer = new URL(VIEWER_URL);
   viewer.searchParams.set('file', resolveFileUrl());
   viewer.searchParams.set('name', NAME);
   viewer.searchParams.set('embed', '1');
   done = false;
   retry.style.display = 'none';
   setStatus('正在加载 RVM 文件…');
   frame.removeAttribute('src');
   frame.srcdoc = '';
   clearTimeout(timer);
   timer = setTimeout(function(){
     if (!done) { setStatus('RVM 长时间未加载：请确认从聊天预览打开且 viewer 服务可达，然后点“重试”', 'bad'); retry.style.display = 'inline-block'; }
   }, 180000);
   try {
     // AIDT 与 viewer 同源时，以 srcdoc 方式启动已部署页面。兼容旧部署包把 Worker
     // 写死为 /rvmsdk/ 的问题，同时避免把模型字节嵌入交付 HTML。
     var response = await fetch(VIEWER_URL, { cache: 'no-store', credentials: 'same-origin' });
     if (!response.ok) throw new Error('查看器入口返回 HTTP ' + response.status);
     var viewerHtml = await response.text();
     var viewerBase = new URL('.', VIEWER_URL).href;
     var workerUrl = new URL('rvmsdk/rvm-worker.js', viewerBase).href;
     var query = viewer.search;
     var bootstrap = '<base href="' + htmlEscape(viewerBase) + '">' +
       '<script>(function(){' +
       'var NativeWorker=window.Worker;' +
       'window.Worker=class extends NativeWorker{constructor(url,options){' +
       'var resolved=new URL(url,document.baseURI);' +
       'super(resolved.pathname==="/rvmsdk/rvm-worker.js"?' + JSON.stringify(workerUrl) + ':url,options);' +
       '}};' +
       'var NativeURLSearchParams=window.URLSearchParams;' +
       'window.URLSearchParams=class extends NativeURLSearchParams{constructor(init){' +
       'super((init===""||init==null)?' + JSON.stringify(query) + ':init);' +
       '}};' +
       '})();<\\/script>';
     if (!/<head(?:\\s[^>]*)?>/i.test(viewerHtml)) throw new Error('查看器入口缺少 head');
     frame.srcdoc = viewerHtml.replace(/<head(\\s[^>]*)?>/i, function(head){ return head + bootstrap; });
   } catch (error) {
     clearTimeout(timer);
     setStatus('RVM 查看器启动失败：' + (error && error.message ? error.message : String(error)), 'bad');
     retry.style.display = 'inline-block';
   }
 }

 retry.addEventListener('click', load);
 frame.addEventListener('load', function(){ if (!done) setStatus('查看器已打开，正在解析 RVM…'); });
 window.addEventListener('message', function(event){
   if (event.origin !== VIEWER_ORIGIN || event.source !== frame.contentWindow) return;
   var message = event.data;
   if (!message || message.v !== 1 || message.type !== 'rvm-viewer:rendered') return;
   done = true;
   clearTimeout(timer);
   setStatus('RVM 已加载（顶点 ' + message.vertices + ' · 三角面 ' + message.triangles + '）', 'ok');
 });
 load();
})();
</script></body></html>`;

const args = parseArgs(process.argv);
if (!args.fileRef || !args.output) {
  fail('用法：node pack_thin_html.mjs --file-ref "media/<uuid>_model.rvm" --output <html> [--name <显示名>] [--viewer-url <url>]');
}

const viewerUrl = (args.viewerUrl || process.env.RVM_VIEWER_URL || DEFAULT_VIEWER_URL).replace(/\\/g, '/');
let viewer;
try {
  viewer = new URL(viewerUrl);
} catch {
  fail(`viewer-url 无效：${viewerUrl}`);
}
if (viewer.protocol !== 'https:' && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(viewer.origin)) {
  fail('viewer-url 必须是 HTTPS；仅允许 http://127.0.0.1 或 http://localhost 用于本地联调。');
}

const fileRef = args.fileRef.replace(/\\/g, '/').replace(/^\.?\//, '');
if (!/^[\w.\-/ %()（）\u4e00-\u9fa5]+$/.test(fileRef) || !fileRef.toLowerCase().endsWith('.rvm')) {
  fail(`file-ref 必须是安全的 .rvm 相对路径，收到：${fileRef}`);
}

const name = (args.name || path.basename(fileRef)).replace(/[<>&"']/g, '');
const output = path.resolve(args.output);
fs.mkdirSync(path.dirname(output), { recursive: true });
const html = THIN_HTML
  .replace(/__TITLE__/g, name)
  .replace('__VIEWER_URL__', JSON.stringify(viewer.href))
  .replace('__VIEWER_ORIGIN__', viewer.origin)
  .replace('__FILE_REF__', JSON.stringify(fileRef))
  .replace('__NAME__', JSON.stringify(name));
fs.writeFileSync(output, html);
console.log(
  JSON.stringify({
    ok: true,
    mode: 'rvm-fileref',
    name,
    fileRef,
    output,
    viewerUrl: viewer.href,
    htmlBytes: Buffer.byteLength(html),
  })
);
