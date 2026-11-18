(() => {
"use strict";
const KEY = "dbdPlayerWatchlist_v020";
const FAV_KEY = "dbdPlayerWatchlist_favorites_v1";
const selectedCategoryDefault = "その他";
let selectedCategory = selectedCategoryDefault;
const CATS = ["利敵行為","意図的切断","放置","煽り","グリッチ","チーター","暴言","その他"];
const HOST_ID = "dbd-watchlist-host";
let currentPath = location.pathname;
let currentSteamId = null;
let resolveToken = 0;
let retrying = false;
const isProfilePath = (p = location.pathname) => /^\/(?:profiles|id)\/[^/]+(?:\/|$)/.test(p);
const validId = v => typeof v === "string" && /^\d{17}$/.test(v) ? v : null;
function pathMatchesVanity(value) {
  if (!value) return false;
  try {
    const u = new URL(value, location.origin);
    const wanted = location.pathname.replace(/\/+$/, "").toLowerCase();
    const actual = u.pathname.replace(/\/+$/, "").toLowerCase();
    return u.origin === location.origin && actual === wanted;
  } catch (_) { return false; }
}
function extractProfileId(source) {
  if (!source) return null;
  // Steamのプロフィール文書に結び付いたURLだけを根拠にする。
  // ログイン中ユーザーのミニプロフィール属性や汎用 data-* は参照しない。
  try {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const canonical = doc.querySelector('link[rel="canonical"]')?.href ||
      doc.querySelector('meta[property="og:url"]')?.content || "";
    try {
      const u = new URL(canonical, location.origin);
      const m = u.pathname.match(/^\/profiles\/(\d{17})(?:\/|$)/);
      if (u.origin === location.origin && m) return validId(m[1]);
    } catch (_) {}
  } catch (_) {}
  // g_rgProfileData を使う場合は、そのプロフィールURLが現在の /id/ URL と
  // 一致することを必須にする。単なる steamid の存在だけでは採用しない。
  const assignments = source.matchAll(/g_rgProfileData\s*=\s*(\{[\s\S]*?\})\s*;/g);
  for (const match of assignments) {
    try {
      const data = JSON.parse(match[1]);
      const profileUrl = data.url || data.profileurl || data.profileUrl || "";
      if (!pathMatchesVanity(profileUrl)) continue;
      const id = validId(String(data.steamid || data.steamID64 || data.steamid64 || ""));
      if (id) return id;
    } catch (_) {}
  }
  // Steam XMLプロフィール応答。steamID64タグだけを読む。
  const xml = source.match(/<steamID64>\s*(\d{17})\s*<\/steamID64>/i);
  if (xml) return validId(xml[1]);
  return null;
}
function getPageId() {
  const m = location.pathname.match(/^\/profiles\/(\d{17})(?:\/|$)/);
  if (m) return validId(m[1]);
  if (!/^\/id\/[^/]+(?:\/|$)/.test(location.pathname)) return null;
  // ページ内のミニプロフィール属性はログイン中ユーザーを指す場合があるため
  // 一切使わず、プロフィール文書固有の canonical / profile data のみ確認。
  const canonical = document.querySelector('link[rel="canonical"]')?.href ||
    document.querySelector('meta[property="og:url"]')?.content || "";
  try {
    const u = new URL(canonical, location.origin);
    const idMatch = u.pathname.match(/^\/profiles\/(\d{17})(?:\/|$)/);
    if (u.origin === location.origin && idMatch) return validId(idMatch[1]);
  } catch (_) {}
  const scripts = Array.from(document.scripts).map(s => s.textContent || '').join('\n');
  return extractProfileId(scripts);
}
async function fetchVanityProfileId() {
  if (!/^\/id\/[^/]+(?:\/|$)/.test(location.pathname)) return null;
  try {
    const response = await fetch(location.href, {credentials:'include', cache:'no-store', redirect:'follow'});
    if (!response.ok) return null;
    try {
      const finalUrl = new URL(response.url);
      const redirected = finalUrl.pathname.match(/^\/profiles\/(\d{17})(?:\/|$)/);
      if (finalUrl.origin === location.origin && redirected) return validId(redirected[1]);
    } catch (_) {}
    const html = await response.text();
    let id = extractProfileId(html);
    if (id) return id;
    // vanity URLの公式XML応答を直接照会。通常HTMLのログイン情報は流用しない。
    const xmlUrl = new URL(location.href);
    xmlUrl.search = "";
    xmlUrl.searchParams.set("xml", "1");
    const xmlResponse = await fetch(xmlUrl.href, {credentials:'include', cache:'no-store', redirect:'follow'});
    if (!xmlResponse.ok) return null;
    const xmlText = await xmlResponse.text();
    const xmlId = xmlText.match(/<steamID64>\s*(\d{17})\s*<\/steamID64>/i);
    return xmlId ? validId(xmlId[1]) : null;
  } catch (_) { return null; }
}
if (!isProfilePath() || document.getElementById(HOST_ID)) return;
const host = document.createElement("div");
host.id = HOST_ID;
host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483000";
document.documentElement.appendChild(host);
const root = host.attachShadow({mode:"open"});
root.innerHTML = `
<style>
*{box-sizing:border-box}button,select,textarea{font:inherit}
.launcher{border:2px solid #05080d;border-radius:12px;padding:18px 25px;color:#fff;background:#2463a6;font-size:22px;font-weight:700;cursor:pointer;box-shadow:0 3px 14px #0005}
.launcher.has-records{background:#d62828}.launcher.is-favorite{background:#168447!important;border-color:#063b20!important}.launch-row{display:flex;align-items:center;justify-content:flex-end;gap:8px}.favorite{width:54px;height:54px;border:2px solid #05080d;border-radius:12px;background:#34485f;color:#fff;font-size:28px;cursor:pointer}.favorite.active{background:#168447;color:#fff;border-color:#063b20}.favorite:disabled{opacity:.5;cursor:not-allowed}
.panel{display:none;width:585px;max-width:calc(100vw - 36px);max-height:86vh;overflow:auto;margin-bottom:10px;padding:25px;border-radius:16px;background:#1b2838;color:#d6d7d8;box-shadow:0 5px 24px #0008;font:18px/1.55 Arial,sans-serif}
.panel.open{display:block}.head{position:sticky;top:-25px;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:12px;margin:-10px 0 12px;padding:10px 0;background:#1b2838}.head strong{font-size:25px;color:#fff;min-width:0}.head-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}.head .favorite{width:46px;height:46px;flex:0 0 46px}
.close{display:flex;align-items:center;justify-content:center;gap:7px;min-width:94px;min-height:46px;padding:8px 14px;border:2px solid #536477;border-radius:9px;background:#2a3b50;color:#fff;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 2px 4px #0003}
.close:hover{background:#354b64;border-color:#71859b}.close:active{transform:scale(.97)}
.id,.note,.entry small{color:#aab7c5;font-size:12px;overflow-wrap:anywhere}.id{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.retry{border:1px solid #718ba5;border-radius:6px;padding:4px 9px;color:#fff;background:#344c65;cursor:pointer;font-size:12px}.retry:hover{background:#405d7b}.retry:disabled{opacity:.6;cursor:wait}
.counts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 20px}.count{display:block;width:100%;text-align:left;background:#26384d;border:2px solid #40546b;border-radius:10px;padding:13px 14px;color:#e1e6ec;font-size:18px;cursor:pointer;transition:background .18s ease,border-color .18s ease,box-shadow .18s ease}.count.has-records{background:#493744}.count.selected{border:3px solid #f4f7fb;background:#3b5875;box-shadow:0 0 0 2px #0b111a}.count b{float:right;color:#fff;font-size:19px}
label{display:block;margin:14px 0 7px;font-size:19px;font-weight:700;color:#f0f3f7}
select,textarea{width:100%;border:1px solid #61758b;border-radius:8px;padding:14px 15px;background:#26384d;color:#fff;font-size:19px}
select{min-height:58px;background:#304b66;border:2px solid #7898b7;box-shadow:inset 0 0 0 1px #ffffff0a}select:focus{outline:2px solid #91bce5;outline-offset:1px}
textarea{min-height:132px;resize:vertical;line-height:1.5}.save{display:block;width:100%;min-width:112px;margin:0;border:2px solid #05080d;border-radius:9px;padding:8px 12px;color:#fff;background:#2463a6;font-size:15px;font-weight:800;cursor:pointer;min-height:46px;white-space:nowrap;box-shadow:0 2px 4px #0003}.save:hover{background:#3078c2}.save:active{transform:scale(.97)}
.backup{display:flex;flex-wrap:wrap;gap:9px;margin:18px 0 8px}.backup button,.backup select{flex:1;min-width:130px;border:1px solid #61758b;border-radius:8px;padding:10px;background:#26384d;color:#fff;font-size:14px;cursor:pointer}.backup input{display:none}.note{margin-top:12px}.panel h3{color:#fff;font-size:21px;margin:20px 0 9px}.entry{border-top:1px solid #3b4b5e;padding:16px 1px}
.entry-title{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:18px;font-weight:700;color:#fff}.entry p{margin:9px 0 12px;white-space:pre-wrap;overflow-wrap:anywhere;color:#e0e5eb;font-size:17px}
.actions{display:flex;gap:8px}.actions button{border:1px solid #53677d;border-radius:8px;padding:10px 16px;cursor:pointer;background:#34485f;color:#fff;font-size:16px}.actions button:hover{background:#405873}.empty{color:#aab7c5;padding:16px 0;font-size:17px}.subnav{display:flex;gap:9px;margin:0 0 15px}.subnav button{flex:1;border:1px solid #61758b;border-radius:8px;padding:12px;background:#26384d;color:#fff;font-size:16px;font-weight:700;cursor:pointer}.subnav button.active{background:#426487;border:2px solid #dce8f5}.directory-group{margin:12px 0 18px}.directory-group h4{margin:0 0 7px;padding:9px 11px;border-radius:8px;background:#30445b;color:#fff;font-size:18px}.directory-user{display:flex;justify-content:space-between;gap:12px;padding:10px 8px;border-bottom:1px solid #3b4b5e;font-size:15px}.directory-user a{color:#a9d3ff;overflow-wrap:anywhere}.directory-user small{color:#bdc8d4;white-space:nowrap}
</style>
<section class="panel" id="panel"><div class="head"><strong>DBD Player Watchlist</strong><div class="head-actions"><button class="favorite" id="favorite" type="button" title="お気に入り" aria-label="お気に入り" aria-pressed="false" disabled>♡</button><button class="close" id="close" type="button" aria-label="閉じる"><span style="font-size:25px;line-height:1;font-weight:900" aria-hidden="true">×</span><span>閉じる</span></button></div></div>
<div class="id" id="identity">Steam ID: 取得中…</div><div class="subnav"><button id="currentTab" class="active" type="button">このプレイヤー</button><button id="directoryTab" type="button">登録ユーザー一覧</button></div><div id="currentView"><div class="counts" id="counts"></div>
<form id="form"><button class="save" id="saveButton" type="submit" form="form">記録を追加</button>
<label for="memo">内容・メモ</label><textarea id="memo" maxlength="1000" placeholder="状況や補足を入力"></textarea></form>
<h3>記録一覧</h3><div id="entries"></div><div class="backup"><button id="importBtn" type="button">データをインポート</button><button id="exportBtn" type="button">データをエクスポート</button><select id="importMode" aria-label="インポート方法"><option value="merge">インポート：統合（おすすめ）</option><option value="replace">インポート：全置き換え</option></select><input id="importFile" type="file" accept=".json,application/json"></div><div class="note">記録はこのPCのSteam拡張機能内に保存されます。</div></div><div id="directoryView" hidden><h3>登録ユーザー（分類別）</h3><div id="directory"></div></div></section>
<div class="launch-row"><button class="launcher" id="launcher">DBD記録</button></div>`;
const $ = s => root.querySelector(s), panel = $("#panel"), launcher = $("#launcher");
function setView(which){const directory=which==="directory";$("#currentView").hidden=directory;$("#directoryView").hidden=!directory;$("#currentTab").classList.toggle("active",!directory);$("#directoryTab").classList.toggle("active",directory);if(directory)renderDirectory()}
async function load(){const d=await chrome.storage.local.get(KEY);return d[KEY]||{}}
async function save(d){await chrome.storage.local.set({[KEY]:d})}
async function loadFavorites(){const d=await chrome.storage.local.get(FAV_KEY);return d[FAV_KEY]||{}}
async function setFavorite(sid,on){const f=await loadFavorites();if(on)f[sid]=true;else delete f[sid];await chrome.storage.local.set({[FAV_KEY]:f});await refreshLauncher()}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function showIdentity(){
  $("#identity").innerHTML=currentSteamId?`Steam ID: ${esc(currentSteamId)}`:`Steam ID: 未取得 <button class="retry" id="retry" type="button">再取得</button>`;
  const b=$("#retry");if(b)b.onclick=async()=>{if(retrying)return;retrying=true;b.disabled=true;b.textContent="取得中…";await resolveId();retrying=false};
}
function unavailable(){showIdentity();$("#counts").innerHTML="";$("#entries").innerHTML='<div class="empty">Steam IDを取得できませんでした。「再取得」を押してください。</div>';launcher.classList.remove("has-records","is-favorite");launcher.title="Steam IDを取得できていません";$("#favorite").disabled=true;$("#favorite").classList.remove("active");$("#favorite").textContent="♡"}
async function refreshLauncher(){if(!currentSteamId){launcher.classList.remove("has-records","is-favorite");$("#favorite").classList.remove("active");$("#favorite").textContent="♡";$("#favorite").disabled=true;return}const d=await load(),r=Array.isArray(d[currentSteamId])?d[currentSteamId]:[],f=await loadFavorites(),fav=!!f[currentSteamId];launcher.classList.toggle("has-records",r.length>0);launcher.classList.toggle("is-favorite",fav);$("#favorite").disabled=false;$("#favorite").classList.toggle("active",fav);$("#favorite").textContent=fav?"♥":"♡";$("#favorite").setAttribute("aria-pressed",String(fav));launcher.title=fav?"お気に入り登録中":(r.length?`登録済みの記録：${r.length}件`:"このプレイヤーの記録はありません") }
async function render(){if(!currentSteamId)return unavailable();const sid=currentSteamId,d=await load();if(sid!==currentSteamId)return;const records=Array.isArray(d[sid])?d[sid]:[];
  $("#counts").innerHTML=CATS.map(c=>`<button type="button" class="count ${records.some(v=>v.category===c)?"has-records":""} ${selectedCategory===c?"selected":""}" data-category="${esc(c)}">${esc(c)}<b>${records.filter(v=>v.category===c).length}</b></button>`).join("");
  $("#counts").querySelectorAll("[data-category]").forEach(btn=>btn.onclick=()=>{selectedCategory=btn.dataset.category;$("#counts").querySelectorAll(".count").forEach(x=>x.classList.toggle("selected",x===btn))});
  const box=$("#entries");if(!records.length)box.innerHTML='<div class="empty">このプレイヤーの記録はまだありません。</div>';
  else{box.innerHTML=records.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(v=>`<article class="entry" data-id="${esc(v.id)}"><div class="entry-title"><span>${esc(v.category)}</span><small>${v.createdAt?new Date(v.createdAt).toLocaleString("ja-JP"):"日時不明"}</small></div><p>${esc(v.memo||"メモなし")}</p><div class="actions"><button data-a="edit" type="button">編集</button><button data-a="del" type="button">削除</button></div></article>`).join("");
    box.querySelectorAll("article").forEach(el=>{const id=el.dataset.id;el.querySelector('[data-a="edit"]').onclick=()=>{const r=records.find(v=>v.id===id);if(!r||sid!==currentSteamId)return;selectedCategory=CATS.includes(r.category)?r.category:"その他";$("#memo").value=r.memo||"";$("#form").dataset.edit=id;$("#saveButton").textContent="変更を保存"};el.querySelector('[data-a="del"]').onclick=async()=>{if(sid!==currentSteamId||!confirm("この記録を削除しますか？"))return;const fresh=await load();fresh[sid]=(fresh[sid]||[]).filter(v=>v.id!==id);await save(fresh);await render()}})}
  await refreshLauncher();
}
async function renderDirectory(){const d=await load();const grouped=Object.fromEntries(CATS.map(c=>[c,[]]));let total=0;for(const [sid,arr] of Object.entries(d)){if(!/^\d{17}$/.test(sid)||!Array.isArray(arr))continue;for(const rec of arr){const cat=CATS.includes(rec.category)?rec.category:"その他";grouped[cat].push({sid,rec});total++}}const box=$("#directory");if(!total){box.innerHTML='<div class="empty">登録ユーザーはまだいません。</div>';return}box.innerHTML=CATS.map(c=>{const rows=grouped[c];return `<section class="directory-group"><h4>${esc(c)}（${rows.length}件）</h4>${rows.length?rows.map(({sid,rec})=>`<div class="directory-user" data-sid="${sid}" data-id="${esc(rec.id)}"><div><a href="https://steamcommunity.com/profiles/${sid}/" target="_blank" rel="noopener noreferrer">${esc(sid)}</a><small style="display:block">${rec.createdAt?new Date(rec.createdAt).toLocaleDateString("ja-JP"):"日時不明"} · ${esc((rec.memo||"メモなし").slice(0,80))}</small></div><div class="actions"><button data-dir="edit" type="button">編集</button><button data-dir="del" type="button">削除</button></div></div>`).join(""):'<div class="empty">該当ユーザーなし</div>'}</section>`}).join("");box.querySelectorAll(".directory-user").forEach(el=>{const sid=el.dataset.sid,id=el.dataset.id;el.querySelector('[data-dir="edit"]').onclick=async()=>{const fresh=await load(),rec=(fresh[sid]||[]).find(v=>v.id===id);if(!rec)return;currentSteamId=sid;showIdentity();setView("current");selectedCategory=CATS.includes(rec.category)?rec.category:"その他";$("#memo").value=rec.memo||"";$("#form").dataset.edit=id;$("#saveButton").textContent="変更を保存";await render()};el.querySelector('[data-dir="del"]').onclick=async()=>{if(!confirm("この記録を削除しますか？"))return;const fresh=await load();fresh[sid]=(fresh[sid]||[]).filter(v=>v.id!==id);await save(fresh);await renderDirectory();if(currentSteamId===sid)await render()}})}
async function resolveId(){const token=++resolveToken;let id=getPageId();if(!id&&/^\/id\//.test(location.pathname))id=await fetchVanityProfileId();
  if(token!==resolveToken)return;currentSteamId=id;showIdentity();if(id)await render();else unavailable();}
function resetEditor(){$("#form").reset();delete $("#form").dataset.edit;selectedCategory=selectedCategoryDefault;$("#saveButton").textContent="記録を追加"}
async function syncProfile(force=false){const path=location.pathname;if(!isProfilePath(path)){host.remove();return}if(!host.isConnected)document.documentElement.appendChild(host);if(!force&&path===currentPath)return;currentPath=path;currentSteamId=null;resolveToken++;resetEditor();unavailable();await resolveId()}
launcher.onclick=async()=>{panel.classList.toggle("open");if(panel.classList.contains("open")){setView("current");if(!currentSteamId)await resolveId();else await render()}};
$("#currentTab").onclick=()=>setView("current");$("#directoryTab").onclick=()=>setView("directory");
$("#favorite").onclick=async()=>{if(!currentSteamId)return;const f=await loadFavorites();await setFavorite(currentSteamId,!f[currentSteamId])};
$("#exportBtn").onclick=async()=>{const records=await load(),favorites=await loadFavorites();const payload={format:"DBD_Player_Watchlist",version:1,exportedAt:new Date().toISOString(),records,favorites};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`DBD_Player_Watchlist_backup_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$("#importBtn").onclick=()=>$("#importFile").click();
$("#importFile").onchange=async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;try{const payload=JSON.parse(await file.text());if(!payload||payload.format!=="DBD_Player_Watchlist"||!payload.records||typeof payload.records!=="object"||Array.isArray(payload.records))throw new Error("形式が違います");const incoming={};for(const [sid,arr] of Object.entries(payload.records)){if(!/^\d{17}$/.test(sid)||!Array.isArray(arr))continue;incoming[sid]=arr.filter(v=>v&&typeof v==="object"&&typeof v.id==="string"&&typeof v.category==="string").map(v=>({...v}));}const mode=$("#importMode").value;const label=mode==="replace"?"現在のデータをすべて置き換えます。よろしいですか？":"既存データにバックアップの記録を統合します。同じ記録IDはバックアップ側で更新します。よろしいですか？";if(!confirm(label))return;let result=mode==="replace"?incoming:await load();if(mode==="merge"){for(const [sid,arr] of Object.entries(incoming)){const old=Array.isArray(result[sid])?result[sid]:[];const map=new Map(old.map(v=>[v.id,v]));for(const rec of arr)map.set(rec.id,rec);result[sid]=Array.from(map.values())}}await save(result);const importedFav=payload.favorites&&typeof payload.favorites==="object"?payload.favorites:{};let favs=mode==="replace"?{}:await loadFavorites();for(const [sid,on] of Object.entries(importedFav)){if(/^\d{17}$/.test(sid)&&on)favs[sid]=true;else if(mode==="replace")delete favs[sid]}await chrome.storage.local.set({[FAV_KEY]:favs});alert("インポートが完了しました。");if(panel.classList.contains("open")){await render();if($("#directoryView").hidden===false)await renderDirectory()}}catch(err){alert("インポートできませんでした："+err.message)}finally{e.target.value=""}};
$("#close").onclick=()=>panel.classList.remove("open");
document.addEventListener("click",e=>{if(!panel.classList.contains("open"))return;const path=e.composedPath?e.composedPath():[];if(!path.includes(host))panel.classList.remove("open")},true);
$("#form").onsubmit=async e=>{e.preventDefault();if(!currentSteamId){await resolveId();if(!currentSteamId)return}const sid=currentSteamId,d=await load();if(sid!==currentSteamId)return;const records=Array.isArray(d[sid])?d[sid]:[],editId=$("#form").dataset.edit,now=new Date().toISOString();
  if(editId){const r=records.find(v=>v.id===editId);if(r){r.memo=$("#memo").value.trim();r.updatedAt=now}delete $("#form").dataset.edit;$("#saveButton").textContent="記録を追加"}
  else records.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),category:selectedCategory,memo:$("#memo").value.trim(),createdAt:now,updatedAt:now});
  d[sid]=records;await save(d);$("#memo").value="";await render()};
showIdentity();unavailable();resolveId();
let navTimer=null;function checkRoute(){clearTimeout(navTimer);navTimer=setTimeout(()=>{if(location.pathname!==currentPath||(!host.isConnected&&isProfilePath()))syncProfile(true)},80)}
window.addEventListener("popstate",checkRoute);window.addEventListener("hashchange",checkRoute);
document.addEventListener("click",e=>{const a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(a&&/steamcommunity\.com\/(?:profiles|id)\//i.test(a.href)){setTimeout(checkRoute,100);setTimeout(checkRoute,500)}},true);
const observer=new MutationObserver(()=>{if(location.pathname!==currentPath)checkRoute()});observer.observe(document.documentElement,{childList:true,subtree:true});
const routeTimer=setInterval(()=>{if(location.pathname!==currentPath)syncProfile(true);else if(!host.isConnected&&isProfilePath())document.documentElement.appendChild(host)},700);
window.addEventListener("pagehide",()=>{observer.disconnect();clearInterval(routeTimer);clearTimeout(navTimer)},{once:true});
if(chrome.storage.onChanged)chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes[KEY]){if(panel.classList.contains("open"))render().catch(()=>{});else refreshLauncher().catch(()=>{})}});
})();
