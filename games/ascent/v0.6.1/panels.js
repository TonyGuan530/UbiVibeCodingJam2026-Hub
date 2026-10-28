import {ITEMS,dimensions,occupiedCells,moveItem,rotateItem,canPlace,containerBag,transferItem,lootAll} from './inventory.js?build=0.6.1';
import {RARITIES,summarizeCargo} from './economy.js?build=0.6.1';
const rarityText=def=>def.type==='commodity'?`${RARITIES[def.rarity].name} · ${def.value.toLocaleString()} 信用点`:'功能物资';
const $=id=>document.getElementById(id);
const types={material:'旧材料',medical:'医疗补给',key:'关键资源',equipment:'装备',commodity:'交易货品'};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inside=(e,r)=>e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom;

export class InventoryUI{
 constructor(handlers){
  this.h=handlers;this.selected=null;this.selectedSide='bag';this.drag=null;this.results=[];
  $('closeInventory').onclick=()=>handlers.close();
  $('rotateItem').onclick=()=>this.rotate();
  $('discardItem').onclick=()=>this.discard();
  $('useItem').onclick=()=>{if(this.selected&&this.selectedSide==='bag'){handlers.use(this.selected);this.refresh()}};
  $('quickTransfer').onclick=()=>this.quickTransfer();
  $('lootAll').onclick=()=>this.takeAll();
  $('inventoryPanel').oncontextmenu=e=>e.preventDefault();
  addEventListener('pointermove',e=>this.dragMove(e));
  addEventListener('pointerup',e=>this.dragEnd(e));
  addEventListener('pointercancel',()=>{this.clearDrag();this.refresh()});
 }
 get open(){return!$('inventoryPanel').classList.contains('hide')}
 show(){this.clearDrag();this.selected=null;this.selectedSide='bag';this.results=[];$('bagMessage').textContent='';$('inventoryPanel').classList.remove('hide');this.refresh();$('closeInventory').focus()}
 close(){this.clearDrag();$('inventoryPanel').classList.add('hide')}
 message(text){$('bagMessage').textContent=text;this.h.notify?.(text)}
 state(){const s=this.h.state();if(!s)return null;return{...s,sourceBag:s.source?containerBag(s.source):null}}
 bag(s,side){return side==='source'?s.sourceBag:s.bag}
 grid(side){return $(side==='source'?'lootGrid':'bagGrid')}
 changed(event){this.h.changed?.(event)}
 refresh(){
  if(!this.open||this.drag)return;const s=this.state();if(!s)return;
  this.renderGrid(s.bag,'bag');
  if(s.sourceBag)this.renderGrid(s.sourceBag,'source');else{$('lootGrid').innerHTML='';$('lootGrid').style.aspectRatio='6/4'}
  $('lootGrid').classList.toggle('inactive',!s.sourceBag);
  $('bagCapacity').textContent=`${occupiedCells(s.bag)} / ${s.bag.width*s.bag.height} 格`;
  $('inventoryTitle').textContent=s.source?'搜索 / 双栏整理':'战术背包';
  $('lootTitle').textContent=s.source?.name||'搜索容器';
  const cargo=s.sourceBag?summarizeCargo(s.sourceBag.items):null;
  $('sourceCapacity').textContent=s.sourceBag?`货品 ${cargo.items.length} · 补给/其他 ${s.sourceBag.items.length-cargo.items.length} · ${cargo.value.toLocaleString()} 信用点`:'未打开容器';
  $('lootList').textContent=s.source?(s.sourceBag.items.length?'右键 / Enter 快速转移单件，或拖入右侧背包。':'容器已空。可以把背包物品放回这里。'):'接近箱子或丢弃物，长按 E 搜索。';
  $('lootAll').disabled=!s.sourceBag?.items.length;
  $('lootResults').innerHTML=this.results.map(r=>`<li data-result="${r.ok?'moved':'remaining'}"><b>${r.ok?'已获得':'留在容器'}</b> ${escape(ITEMS[r.id].name)} <small>…${escape(r.uid.slice(-6))}${r.ok?'':' · 空间不足或位置无效'}</small></li>`).join('');
  $('cargoNotice').innerHTML=`<p>货品价值：<b>${summarizeCargo(s.bag.items).value.toLocaleString()} 信用点</b>。整理时行动继续；成功撤离后保留具体物品，价值仅统计。</p>`;
  this.details(s);
  if(this.selected){const selected=[...this.grid(this.selectedSide).querySelectorAll('[data-uid]')].find(button=>button.dataset.uid===this.selected);selected?.focus({preventScroll:true})}
 }
 renderGrid(bag,side){
  const board=this.grid(side);board.style.aspectRatio=`${bag.width}/${bag.height}`;
  board.style.backgroundSize=`${100/bag.width}% ${100/bag.height}%`;
  board.setAttribute('aria-label',`${side==='source'?'目标容器':'玩家背包'} ${bag.width}乘${bag.height}`);
  board.innerHTML=bag.items.map(item=>{const d=dimensions(item),def=ITEMS[item.id],selected=this.selected===item.uid&&this.selectedSide===side;return`<button class="bag-item ${selected?'selected':''}" data-uid="${escape(item.uid)}" data-side="${side}" style="left:${item.x/bag.width*100}%;top:${item.y/bag.height*100}%;width:${d.w/bag.width*100}%;height:${d.h/bag.height*100}%;--item-color:${def.color}" title="${escape(def.name)} · ${rarityText(def)} · ${types[def.type]} · ${d.w}×${d.h} · ${escape(def.use)}" aria-label="${escape(def.name)} 独立物品 ${d.w}乘${d.h}"><span>${def.name}</span><small>${d.w}×${d.h} · ${def.type==='commodity'?def.value.toLocaleString():types[def.type]}</small></button>`}).join('');
  board.querySelectorAll('[data-uid]').forEach(button=>{
   button.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();this.selected=button.dataset.uid;this.selectedSide=side;this.startDrag(e,button)};
   button.onclick=()=>{this.selected=button.dataset.uid;this.selectedSide=side;this.refresh()};
   button.oncontextmenu=e=>{e.preventDefault();this.selected=button.dataset.uid;this.selectedSide=side;this.quickTransfer()};
   button.onfocus=()=>{this.selected=button.dataset.uid;this.selectedSide=side;this.details()};
  });
 }
 details(s=this.state()){
  if(!s)return;const item=this.bag(s,this.selectedSide)?.items.find(i=>i.uid===this.selected);
  $('useItem').disabled=!item||this.selectedSide!=='bag'||!['medical','equipment'].includes(ITEMS[item.id].type);$('discardItem').disabled=!item;$('rotateItem').disabled=!item;
  $('quickTransfer').disabled=!item||!s.sourceBag;
  $('quickTransfer').textContent=this.selectedSide==='source'?'拾取 →':'← 放回容器';
  if(!item){$('itemDetails').innerHTML='<p>选择任一侧的物品查看尺寸、类别与属性。每一件独立占格，不自动合并。</p>';return}
  const d=dimensions(item),def=ITEMS[item.id];
  $('itemDetails').innerHTML=`<b style="color:${def.color}">${def.name}</b><dl><dt>位置</dt><dd>${this.selectedSide==='source'?'目标容器':'玩家背包'}</dd><dt>类别</dt><dd>${types[def.type]}</dd><dt>品级</dt><dd>${rarityText(def)}</dd><dt>占格</dt><dd>${d.w}×${d.h} · ${item.rotated?'已旋转':'未旋转'}</dd><dt>实例</dt><dd class="item-uid">${escape(item.uid)}</dd><dt>用途</dt><dd>${def.use}</dd>${Object.keys(item.attributes||{}).length?`<dt>属性</dt><dd>${escape(JSON.stringify(item.attributes))}</dd>`:''}</dl>`;
 }
 discard(){
  if(!this.selected||this.drag)return;const uid=this.selected,side=this.selectedSide;
  this.h.drop(uid,side);this.selected=null;this.changed({type:'drop',uid,side});this.refresh();
 }
 quickTransfer(){
  const s=this.state();if(!s?.sourceBag||!this.selected)return;
  const from=this.selectedSide,to=from==='source'?'bag':'source',uid=this.selected;
  const result=transferItem(this.bag(s,from),this.bag(s,to),uid);
  if(result.ok){this.selectedSide=to;this.message(from==='source'?'已拾取单件物品':'已放回目标容器');this.changed({type:'transfer',uid,from,to})}
  else this.message('空间不足：物品仍在原处，未转移');
  this.refresh();
 }
 takeAll(){
  const s=this.state();if(!s?.sourceBag)return;
  const report=lootAll(s.sourceBag,s.bag);this.results=report.results;
  this.message(`已获得 ${report.moved.length} 件；${report.remaining.length} 件留在容器${report.remaining.length?'（空间不足）':''}`);
  this.changed({type:'lootAll',report});this.refresh();
 }
 rotate(){
  const s=this.state();if(!s||!this.selected)return;
  if(this.drag){this.drag.rotated=!this.drag.rotated;this.drag.grabX=0;this.drag.grabY=0;this.dragMove(this.drag.lastEvent);return}
  const bag=this.bag(s,this.selectedSide);if(!bag)return;const r=rotateItem(bag,this.selected);
  if(!r.ok)this.message('旋转失败：目标空间不足，物品保持原位');else this.changed({type:'move',uid:this.selected,side:this.selectedSide});
  this.refresh();
 }
 key(e){
  if(!this.open)return false;
  if(e.code==='KeyR'){e.preventDefault();this.rotate();return true}
  if(e.code==='KeyT'||e.code==='Enter'){
   if(e.target?.tagName==='BUTTON'&&!e.target?.dataset?.uid)return false;
   e.preventDefault();this.quickTransfer();return true;
  }
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.code];
  if(delta&&this.selected){
   e.preventDefault();if(this.drag)return true;const s=this.state(),bag=s&&this.bag(s,this.selectedSide),item=bag?.items.find(i=>i.uid===this.selected);
   if(item){const r=moveItem(bag,item.uid,item.x+delta[0],item.y+delta[1],item.rotated);if(!r.ok)this.message('移动失败：物品保持原位');else this.changed({type:'move',uid:item.uid,side:this.selectedSide});this.refresh()}
   return true;
  }
  return false;
 }
 startDrag(e,button){
  this.clearDrag();const s=this.state(),bag=s&&this.bag(s,this.selectedSide),item=bag?.items.find(i=>i.uid===this.selected);if(!item)return;
  const r=this.grid(this.selectedSide).getBoundingClientRect();
  this.drag={uid:item.uid,from:this.selectedSide,rotated:item.rotated,grabX:Math.floor((e.clientX-r.left)/(r.width/bag.width))-item.x,grabY:Math.floor((e.clientY-r.top)/(r.height/bag.height))-item.y,lastEvent:e};
  button.classList.add('drag-origin');
  const ghost=button.cloneNode(true);ghost.className='bag-drag';ghost.removeAttribute('data-uid');ghost.id='bagDragGhost';document.body.appendChild(ghost);this.dragMove(e);this.details(s);
 }
 dragMove(e){
  if(!this.drag||!e)return;this.drag.lastEvent=e;const s=this.state();if(!s){this.clearDrag();return}
  const fromBag=this.bag(s,this.drag.from),item=fromBag?.items.find(i=>i.uid===this.drag.uid);if(!item){this.clearDrag();this.refresh();return}
  this.drag.target=null;let board=this.grid(this.drag.from),bag=fromBag;
  for(const side of ['source','bag']){const b=this.bag(s,side),grid=this.grid(side);if(b&&inside(e,grid.getBoundingClientRect())&&inside(e,grid.parentElement.getBoundingClientRect())){this.drag.target=side;board=grid;bag=b;break}}
  const r=board.getBoundingClientRect(),cw=r.width/bag.width,ch=r.height/bag.height,d=dimensions(item,this.drag.rotated),ghost=$('bagDragGhost');
  const x=Math.floor((e.clientX-r.left)/cw)-this.drag.grabX,y=Math.floor((e.clientY-r.top)/ch)-this.drag.grabY;
  Object.assign(this.drag,{x,y});
  const valid=this.drag.target&&canPlace(bag,item,x,y,this.drag.rotated,this.drag.target===this.drag.from?item.uid:null);
  Object.assign(ghost.style,{left:`${e.clientX-this.drag.grabX*cw}px`,top:`${e.clientY-this.drag.grabY*ch}px`,width:`${cw*d.w}px`,height:`${ch*d.h}px`,background:ITEMS[item.id].color+'88',borderColor:valid?'#8ff5c8':'#ff7d78'});
  ghost.dataset.valid=valid?'true':'false';
  document.querySelectorAll('.loot-placement').forEach(p=>p.remove());
  if(this.drag.target){const preview=document.createElement('div');preview.className=`loot-placement ${valid?'valid':'invalid'}`;Object.assign(preview.style,{left:`${x/bag.width*100}%`,top:`${y/bag.height*100}%`,width:`${d.w/bag.width*100}%`,height:`${d.h/bag.height*100}%`});board.appendChild(preview)}
 }
 dragEnd(e){
  if(!this.drag)return;this.dragMove(e);if(!this.drag)return;const drag=this.drag,s=this.state();
  if(inside(e,$('dropZone').getBoundingClientRect())){this.h.drop(drag.uid,drag.from);this.changed({type:'drop',uid:drag.uid,side:drag.from});this.selected=null}
  else if(drag.target){
   const placement={x:drag.x,y:drag.y,rotated:drag.rotated},result=transferItem(this.bag(s,drag.from),this.bag(s,drag.target),drag.uid,placement);
   if(!result.ok)this.message('空间不足或位置无效：物品仍在原处');else{this.selectedSide=drag.target;this.message(drag.from===drag.target?'已调整物品位置':drag.target==='bag'?'已拾取单件物品':'已放回目标容器');this.changed({type:drag.from===drag.target?'move':'transfer',uid:drag.uid,from:drag.from,to:drag.target})}
  }else this.message('未放入容器：物品保持原位');
  this.clearDrag();this.refresh();
 }
 clearDrag(){this.drag=null;$('bagDragGhost')?.remove();document.querySelectorAll('.loot-placement').forEach(p=>p.remove());document.querySelectorAll('.drag-origin').forEach(p=>p.classList.remove('drag-origin'))}
}
