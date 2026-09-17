#!/usr/bin/env node
// pack_thin_html.mjs — RVM Viewer 智能体天赋脚本（零依赖，仅 Node 标准库）
//
// 把用户上传的模型交给"薄 HTML"交付件，三种模式自动/手动选择：
//   1. payload 模式：  小几何（JSON ≤ 30KB）base64url 后放进 viewer URL 参数，viewer 打开即渲染；
//   2. postmsg 模式：  大几何内嵌薄 HTML，iframe 加载后向 viewer postMessage 注入（带重试与超时提示）；
//   3. fileref 模式：  原文件不进 HTML（.rvm 等几十 MB 级），薄 HTML 先将平台工作区相对路径解析为
//                      绝对 URL，再传给 viewer；前端据此 fetch 原文件后自行解析。
//
// 用法:
//   node pack_thin_html.mjs --input <模型绝对路径> --output <输出html路径> [--viewer-url <url>]
//   node pack_thin_html.mjs --file-ref "media/<uuid>_model.rvm" [--att "media/<uuid>_model.att"]
//                          [--name <显示名>] --output <输出html路径> [--viewer-url <url>]
// viewer 地址优先级: --viewer-url > 环境变量 RVM_VIEWER_URL > 脚本内 DEFAULT_VIEWER_URL
//
// 注意: 面向用户交付时 viewer 必须是 https 地址；http://127.0.0.1 仅限本地联调
// （聊天预览页面运行在 https 安全上下文里，iframe http:// 会被混合内容策略拦截）。
// fileref 模式的交付件只能从聊天预览打开（依赖登录态访问平台文件服务），另存本地会失效。

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VIEWER_URL = 'https://REPLACE-WITH-YOUR-VIEWER-HOST/'; // TODO: 前端部署后改成实际地址
const URL_PAYLOAD_MAX_BYTES = 30 * 1024; // 几何 JSON 超过此字节数走 postMessage 通道

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input') a.input = argv[++i];
    else if (argv[i] === '--output') a.output = argv[++i];
    else if (argv[i] === '--viewer-url') a.viewerUrl = argv[++i];
    else if (argv[i] === '--file-ref') a.fileRef = argv[++i];
    else if (argv[i] === '--att') a.att = argv[++i];
    else if (argv[i] === '--name') a.name = argv[++i];
  }
  return a;
}

// ---------- OBJ ----------
function parseOBJ(text) {
  const pos = [];
  const tris = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('v ')) {
      const p = t.slice(2).trim().split(/\s+/).map(Number);
      if (p.length >= 3 && p.every(Number.isFinite)) pos.push(p[0], p[1], p[2]);
    } else if (t.startsWith('f ')) {
      const idx = t.slice(2).trim().split(/\s+/).map(tok => {
        const s = tok.split('/')[0];
        let i = parseInt(s, 10);
        if (!Number.isFinite(i)) return NaN;
        return i > 0 ? i - 1 : pos.length / 3 + i;
      });
      for (let k = 1; k + 1 < idx.length; k++) {
        if ([idx[0], idx[k], idx[k + 1]].every(Number.isFinite)) tris.push(idx[0], idx[k], idx[k + 1]);
      }
    }
  }
  return { pos, tris };
}

// ---------- STL (binary + ascii) ----------
function parseSTL(buf) {
  const trisFromVerts = (verts) => {
    const tris = [];
    for (let i = 0; i < verts.length / 3; i += 3) tris.push(i, i + 1, i + 2);
    return tris;
  };
  const head = buf.slice(0, Math.min(buf.length, 200)).toString('latin1');
  if (/^\s*solid/i.test(head)) {
    const asText = buf.toString('utf8');
    if (/endsolid/i.test(asText)) {
      const pos = [];
      const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
      let m;
      while ((m = re.exec(asText))) pos.push(+m[1], +m[2], +m[3]);
      if (pos.length >= 9) return { pos, tris: trisFromVerts(pos) };
    }
  }
  // binary
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(80, true);
  const pos = new Array(n * 9);
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12; // skip normal
    for (let k = 0; k < 9; k++) { pos[i * 9 + k] = dv.getFloat32(o, true); o += 4; }
    o += 2; // attribute
  }
  return { pos, tris: trisFromVerts(pos) };
}

// ---------- 编码 ----------
function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function roundCoords(arr) {
  return arr.map(x => Math.round(x * 1e5) / 1e5);
}

// ---------- 薄 HTML 模板（占位符替换，占位符仅出现在属性/独立 token 位置） ----------
// __SRC__      iframe 初始地址（payload 模式带 ?payload=...，postMessage 模式为裸地址；fileref 为 about:blank）
// __ORIGIN__   viewer 的 origin，postMessage targetOrigin 与回执校验用
// __VIEWER_URL__ viewer 的完整基础 URL（fileref 运行时追加参数）
// __MODE__     "payload" | "postmsg" | "fileref"
// __DATA__     postMessage 模式的几何 JSON 字面量；payload 模式为 null
const THIN_HTML = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>模型查看器 — __TITLE__</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 html,body{margin:0;height:100%;background:#101418;color:#dfe7ee;font:13px/1.5 system-ui,"Segoe UI",sans-serif}
 #bar{position:fixed;inset:0 0 auto 0;display:flex;align-items:center;gap:10px;padding:7px 12px;
      background:rgba(16,20,24,.92);border-bottom:1px solid #2b3540;z-index:5}
 #st{flex:1;color:#8fa3b5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 #st.ok{color:#59c98d}#st.bad{color:#e06c5a}
 #retry{display:none;border:1px solid #3d4a57;background:#1b232b;color:#dfe7ee;border-radius:6px;padding:3px 12px;cursor:pointer}
 #retry:hover{background:#242e38}
 #frame{position:fixed;inset:34px 0 0 0;width:100%;height:calc(100% - 34px);border:0;background:#101418}
</style></head><body>
<div id="bar"><span id="st">正在连接查看器…</span><button id="retry" type="button">重试</button></div>
<iframe id="frame" src="__SRC__" title="模型查看器" allow="fullscreen"></iframe>
<script>
(function(){
 'use strict';
 var MODE = "__MODE__";
 var VIEWER_ORIGIN = "__ORIGIN__";
 var VIEWER_URL = __VIEWER_URL__;
 var FILE_REF = __FILE_REF__;
 var ATT_REF = __ATT_REF__;
 var DATA = __DATA__;               // payload 模式下为 null，数据在 URL 里，由 viewer 自行渲染
 var NAME = __NAME__;
 var st = document.getElementById('st');
 var retryBtn = document.getElementById('retry');
 var frame = document.getElementById('frame');
 var tries = 0, timer = null, done = false;

 function setST(text, cls){ st.textContent = text; st.className = cls || ''; }

 function startFileRef(){
   // media/... 是 AIDT 预览页所在工作区的相对路径。不能让外部 viewer 自己相对解析，
   // 否则它会错误地指向静态 viewer 域名而非平台文件服务。
   var viewer = new URL(VIEWER_URL);
   viewer.searchParams.set('file', new URL(FILE_REF, document.baseURI).href);
   if (ATT_REF) viewer.searchParams.set('att', new URL(ATT_REF, document.baseURI).href);
   viewer.searchParams.set('name', NAME);
   frame.src = viewer.href;
   clearTimeout(timer);
   timer = setTimeout(function(){
     if (!done) { setST('工作区文件长时间未加载：请确认从聊天预览打开且 viewer 服务可达，然后点"重试"', 'bad'); retryBtn.style.display = 'inline-block'; }
   }, 20000);
 }

 function sendOnce(){
   if (!DATA) return;
   try { frame.contentWindow.postMessage(DATA, VIEWER_ORIGIN); }
   catch (e) { setST('注入失败：' + e.message, 'bad'); }
 }
 function sendLoop(){
   if (done || !DATA) return;
   sendOnce();
   tries++;
   if (tries < 8) { timer = setTimeout(sendLoop, 1500); }
   else { setST('查看器长时间未响应：请确认 viewer 服务已部署且地址可达，然后点"重试"', 'bad'); retryBtn.style.display = 'inline-block'; }
 }
 retryBtn.addEventListener('click', function(){
   tries = 0; clearTimeout(timer); retryBtn.style.display = 'none';
   if (MODE === 'payload') { location.reload(); }
   else if (MODE === 'fileref') { done = false; setST('正在重新加载工作区文件…'); frame.src = 'about:blank'; setTimeout(startFileRef, 0); }
   else { setST('正在重发模型数据…'); sendLoop(); }
 });

 frame.addEventListener('load', function(){
   if (MODE === 'postmsg') { setST('已连接查看器，正在传输模型…'); tries = 0; clearTimeout(timer); sendLoop(); }
   else if (MODE === 'fileref') { setST('已连接查看器，正在加载工作区文件…'); }
 });

 window.addEventListener('message', function(e){
   if (e.origin !== VIEWER_ORIGIN) return;
   var m = e.data;
   if (!m || m.v !== 1) return;
   if (m.type === 'rvm-viewer:rendered') {
     done = true; clearTimeout(timer); retryBtn.style.display = 'none';
     setST('模型已加载' + (m.triangles ? '（顶点 ' + m.vertices + ' · 三角面 ' + m.triangles + '）' : ''), 'ok');
   } else if (m.type === 'rvm-viewer:ready' && DATA && !done) {
     tries = 0; clearTimeout(timer); sendLoop();
   }
 });

 if (MODE === 'payload') {
   setST('已连接查看器，正在渲染…');
   // viewer 渲染完会回 rendered 回执；10 秒无回执视为异常
   timer = setTimeout(function(){
     if (!done) { setST('查看器长时间未响应：请确认 viewer 服务已部署且地址可达，然后点"重试"刷新', 'bad'); retryBtn.style.display = 'inline-block'; }
   }, 10000);
 } else if (MODE === 'fileref') {
   setST('正在连接查看器并加载工作区文件…');
   startFileRef();
 }
})();
</script></body></html>`;

// ---------- main ----------
const args = parseArgs(process.argv);
const viewerUrl = (args.viewerUrl || process.env.RVM_VIEWER_URL || DEFAULT_VIEWER_URL).replace(/\\/g, '/');
if (!args.output || (!args.input && !args.fileRef)) {
  console.error(JSON.stringify({ ok: false, error: '用法: node pack_thin_html.mjs (--input <模型> | --file-ref "media/<uuid>_原名.rvm" [--att <att路径>]) --output <html> [--viewer-url <url>]' }));
  process.exit(1);
}
if (args.input && args.fileRef) {
  console.error(JSON.stringify({ ok: false, error: '--input 与 --file-ref 二选一：解析打包用 --input，原文件引用用 --file-ref' }));
  process.exit(1);
}
if (!/^https?:\/\//.test(viewerUrl)) {
  console.error(JSON.stringify({ ok: false, error: 'viewer-url 必须以 http(s):// 开头，收到: ' + viewerUrl }));
  process.exit(1);
}
const isHttps = viewerUrl.startsWith('https://');
const isLoopbackHttp = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(viewerUrl);
if (!isHttps && !isLoopbackHttp) {
  console.error(JSON.stringify({ ok: false, error: 'viewer-url 必须是 https（或本地联调的 http://127.0.0.1/*）。聊天预览页是 https 安全上下文，iframe http:// 会被混合内容拦截。' }));
  process.exit(1);
}

const output = path.resolve(args.output);
fs.mkdirSync(path.dirname(output), { recursive: true });

// ---------- 模式 3：fileref —— 原文件不进 HTML，交付页负责将工作区相对路径解析为绝对 URL ----------
if (args.fileRef) {
  const ref = args.fileRef.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!/^[\w.\-/ %()（）\u4e00-\u9fa5]+$/.test(ref)) {
    console.error(JSON.stringify({ ok: false, error: 'file-ref 路径含异常字符: ' + ref }));
    process.exit(1);
  }
  const name = (args.name || path.basename(ref)).replace(/[<>&"']/g, '');
  const att = args.att ? args.att.replace(/\\/g, '/').replace(/^\.?\//, '') : null;
  if (att && !/^[\w.\-/ %()（）\u4e00-\u9fa5]+$/.test(att)) {
    console.error(JSON.stringify({ ok: false, error: 'att 路径含异常字符: ' + att }));
    process.exit(1);
  }
  const viewerOrigin = new URL(viewerUrl).origin;
  const html = THIN_HTML
    .replace(/__TITLE__/g, name)
    .replace(/__SRC__/g, 'about:blank')
    .replace(/__ORIGIN__/g, viewerOrigin)
    .replace('__VIEWER_URL__', JSON.stringify(viewerUrl))
    .replace('__FILE_REF__', JSON.stringify(ref))
    .replace('__ATT_REF__', JSON.stringify(att))
    .replace('__NAME__', JSON.stringify(name))
    .replace(/__MODE__/g, 'fileref')
    .replace('__DATA__', 'null');
  fs.writeFileSync(output, html);
  console.log(JSON.stringify({
    ok: true, mode: 'fileref', name, fileRef: ref, att,
    output, viewerUrl, htmlBytes: Buffer.byteLength(html),
    note: '交付件为几KB壳，仅从聊天预览打开（依赖登录态）；页面会将 media/ 相对路径解析为平台文件绝对地址'
  }));
  process.exit(0);
}

// ---------- 模式 1/2：解析 .obj/.stl → payload 或 postmsg ----------
const input = path.resolve(args.input);
if (!fs.existsSync(input)) { console.error(JSON.stringify({ ok: false, error: '输入文件不存在: ' + input })); process.exit(1); }
const ext = path.extname(input).toLowerCase();
const buf = fs.readFileSync(input);
let mesh, fmt;
if (ext === '.obj') { mesh = parseOBJ(buf.toString('utf8')); fmt = 'OBJ'; }
else if (ext === '.stl') { mesh = parseSTL(buf); fmt = 'STL'; }
else { console.error(JSON.stringify({ ok: false, error: '仅支持 .obj/.stl，收到: ' + ext + '。.rvm 等原文件请用 --file-ref 模式；.rvt 需先转换为开放格式。' })); process.exit(1); }

const nV = mesh.pos.length / 3, nT = mesh.tris.length / 3;
if (!nV || !nT) { console.error(JSON.stringify({ ok: false, error: '未解析出几何（顶点 ' + nV + ' 面 ' + nT + '）' })); process.exit(1); }

const name = path.basename(input);
const geoJson = JSON.stringify({ v: 1, type: 'rvm-viewer:geometry', name, format: fmt, pos: roundCoords(mesh.pos), tris: mesh.tris });
const geoBytes = Buffer.byteLength(geoJson, 'utf8');

let mode, src, dataLiteral;
if (geoBytes <= URL_PAYLOAD_MAX_BYTES) {
  mode = 'payload';
  const sep = viewerUrl.includes('?') ? '&' : '?';
  src = viewerUrl + sep + 'payload=' + b64url(geoJson) + '&name=' + encodeURIComponent(name);
  dataLiteral = 'null';
} else {
  mode = 'postmsg';
  const sep = viewerUrl.includes('?') ? '&' : '?';
  src = viewerUrl + sep + 'name=' + encodeURIComponent(name);
  dataLiteral = geoJson; // 内嵌为 JS 字面量（脚本已在上面 JSON.stringify，含类型与长度校验）
}

const viewerOrigin = new URL(src).origin;
const html = THIN_HTML
  .replace(/__TITLE__/g, name.replace(/[<>&"']/g, ''))
  // src 进 HTML 属性：先转义 & 为 &amp;（浏览器解析属性值后还原为 &），双引号走 URL 编码
  .replace(/__SRC__/g, src.replace(/&/g, '&amp;').replace(/"/g, '%22'))
  .replace(/__ORIGIN__/g, viewerOrigin)
  .replace('__VIEWER_URL__', JSON.stringify(viewerUrl))
  .replace('__FILE_REF__', 'null')
  .replace('__ATT_REF__', 'null')
  .replace('__NAME__', JSON.stringify(name))
  .replace(/__MODE__/g, mode)
  // JSON 内嵌 <script>：转义 </script> 序列，防提前终止标签
  .replace('__DATA__', dataLiteral.replace(/</g, '\\u003c'));

fs.writeFileSync(output, html);
console.log(JSON.stringify({
  ok: true, format: fmt, vertices: nV, triangles: nT, output,
  mode, geometryBytes: geoBytes, viewerUrl: viewerUrl, htmlBytes: Buffer.byteLength(html)
}));
