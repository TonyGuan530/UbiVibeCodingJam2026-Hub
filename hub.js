'use strict';
const $=id=>document.getElementById(id);
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const defaults=[{key:'WASD',action:'移动'},{key:'右键 / ← →',action:'视角'},{key:'E',action:'交互 / 搜索'},{key:'I / Tab',action:'背包'},{key:'Q',action:'治疗'},{key:'Esc',action:'暂停'}];
function localURL(value){const url=new URL(value,location.href);if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol))throw Error('游戏地址不可用');return url.href}
function errorBlock(title,message){const box=make('div','error-state'),heading=make('strong','',title),p=make('p','',message),link=make('a','','返回试玩室');link.href='./';box.append(heading,p,link);return box}
function iconArrow(){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('play-arrow');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','m8 5 11 7-11 7Z');svg.append(path);return svg}
function renderHome(games){
 const list=$('gameList');list.replaceChildren();
 if(!games.length){list.append(make('p','loading-text','暂时还没有可试玩的原型，请稍后再来。'));return}
 for(const game of games){
  const target=`./play.html?game=${encodeURIComponent(game.id)}`,card=make('article','game-card'),art=make('a','game-art');art.href=target;art.setAttribute('aria-label',`开始试玩 ${game.title} ${game.subtitle||''}`);
  if(game.cover){const img=make('img');img.src=localURL(game.cover);img.alt=`${game.title} 游戏实机画面`;img.width=1600;img.height=900;img.decoding='async';art.append(img)}
  art.append(make('span','image-caption','实机画面'));
  const body=make('div','game-body'),meta=make('div','game-meta');meta.append(make('span','status',game.status||'试玩原型'),make('span','version',game.version||''));
  const title=make('h3','game-title',game.title),subtitle=make('div','game-subtitle',game.subtitle||''),description=make('p','game-description',game.description||''),tags=make('div','tags');
  for(const tag of game.tags||[])tags.append(make('span','tag',tag));
  const bottom=make('div','game-bottom'),date=make('span','updated',game.updatedAt?`更新于 ${game.updatedAt}`:'持续迭代中'),button=make('a','button button-accent','开始试玩');button.href=target;button.append(iconArrow());
  bottom.append(date,button);body.append(meta,title,subtitle,description,tags,bottom);card.append(art,body);list.append(card);
 }
}
function renderPlay(games){
 const id=new URLSearchParams(location.search).get('game'),game=games.find(g=>g.id===id),mount=$('playerMount'),status=$('loadStatus');
 if(!game){$('playTitle').textContent='未找到这个游戏';status.textContent='请选择试玩室中当前可玩的原型。';mount.append(errorBlock('这个试玩入口暂时不可用','游戏可能已经更新或移动。返回试玩室选择当前版本即可。'));return}
 document.title=`${game.title} ${game.version||''} · UbiVibe 试玩室`;$('playTitle').textContent=`${game.title}${game.subtitle?' · '+game.subtitle:''}`;$('playVersion').textContent=`${game.version||''} · ${game.status||'试玩原型'}`;
 const url=localURL(game.url),link=$('directLink');link.href=new URL(`play.html?game=${encodeURIComponent(id)}`,location.href).href;link.hidden=false;
 const frame=make('iframe','game-frame');frame.id='gameFrame';frame.title=`${game.title} ${game.subtitle||''} 游戏`;frame.allow='fullscreen; autoplay; gamepad';frame.allowFullscreen=true;frame.setAttribute('loading','eager');
 const timeout=setTimeout(()=>{status.textContent='载入比预期久？可以使用上方“单独打开”继续试玩。'},18000);
 frame.addEventListener('load',()=>{clearTimeout(timeout);status.textContent='点击游戏画面开始，再用键盘和鼠标操作。';$('fullscreenButton').disabled=false});
 frame.addEventListener('error',()=>{clearTimeout(timeout);status.textContent='游戏未能载入，请刷新页面，或使用“单独打开”重试。';status.classList.add('error')});
 const overlay=make('nav','game-overlay');overlay.setAttribute('aria-label','试玩导航');const back=make('a','overlay-back','← 返回 Hub');back.id='returnHub';back.href='./';overlay.append(back);frame.src=url;mount.append(frame,overlay);
 for(const control of game.controls?.length?game.controls:defaults){const item=make('span','control');item.append(make('kbd','',control.key),make('span','',control.action));$('playGuide').append(item)}
 $('fullscreenButton').addEventListener('click',async()=>{try{if(!mount.requestFullscreen)throw Error('Fullscreen unavailable');await mount.requestFullscreen();frame.focus()}catch{status.textContent='当前浏览器无法进入全屏，可以选择“单独打开”获得更大的画面。'}});
}
(async()=>{try{const response=await fetch('./games.json',{cache:'no-store'});if(!response.ok)throw Error('manifest unavailable');const manifest=await response.json(),games=Array.isArray(manifest)?manifest:manifest.games;if(!Array.isArray(games))throw Error('manifest invalid');const valid=games.filter(g=>g&&typeof g.id==='string'&&typeof g.title==='string'&&typeof g.url==='string');if(document.body.dataset.page==='play')renderPlay(valid);else renderHome(valid)}catch(error){console.error('Hub could not load the game list:',error);if(document.body.dataset.page==='play'){$('playTitle').textContent='暂时无法载入游戏';$('loadStatus').textContent='请刷新页面重试。';$('playerMount').append(errorBlock('游戏列表暂时不可用','请稍后刷新，或返回试玩室重新选择。'))}else{$('gameList').replaceChildren(errorBlock('游戏列表暂时不可用','请刷新页面重试。'))}}})();
