import {Renderer} from './gl.js?build=0.6.2';
import {RARITIES,CHEST_TABLES,chestTier,rollCargo,rollCargoSlot,createContract,progressContract,summarizeCargo,settleEconomy} from './economy.js?build=0.6.2';
import {SETTINGS} from './config.js?build=0.6.2';
import {LEVELS,isWalkable,isLineClear,pathTo,createWorldObjects,navigationTarget,STAIR_LINKS,FLOOR_HEIGHT,WALL_HEIGHT,SLAB_THICKNESS} from './world.js?build=0.6.2';
import {ITEMS,createBag,addItem,removeItem,countItem,bagItems,occupiedCells,normalizeLoot,containerBag,transferItem} from './inventory.js?build=0.6.2';
import {ROLES,ENEMIES,makeEnemy,stepCombat} from './combat.js?build=0.6.2';
import {activeExitAt,migrateSave,bankRun,withdrawWarehouse} from './rules.js?build=0.6.2';
import {TRIAL_SETTINGS,createTrial,startTrial,tickTrial,canUseTrial} from './trials.js?build=0.6.2';
import {buildExitSchedule} from './timing.js?build=0.6.2';
import {createTransit,tickTransit} from './transit.js?build=0.6.2';
import {InventoryUI} from './panels.js?build=0.6.2';
import {createTeam,recruitMember,damageTeam,healTeam} from './squad.js?build=0.6.2';
import {createFog,updateFog,fogState,fogBoxState,fogRuns,pointVisible,fogSummary} from './fog.js?build=0.6.2';
import {pressureAt} from './pressure.js?build=0.6.2';
import {buildNavigation,altarState,bearingDegrees} from './navigation.js?build=0.6.2';
import {FLOOR_THEMES,buildLandmarks} from './landmarks.js?build=0.6.2';

// v0.1 lifecycle retained: start/update/collect/gainXp/changeFloor/extract/die/persist.
// Geometry, inventory and combat now have separately tested implementations.
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const fmt=t=>`${String(Math.floor(Math.max(0,t)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
const KEY='ascent_idea02_demo_v01';
const QA_MODE=typeof location!=='undefined'&&new URLSearchParams(location.search).has('qa');
const COLORS=Object.fromEntries(Object.entries(ROLES).map(([id,r])=>[id,r.color]));COLORS.enemy='#d65f64';
const FLOOR_NAMES=LEVELS.map(l=>l.name);
let save=migrateSave();try{save=migrateSave(JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}
let game=null,keys=new Set(),audioCtx=null,renderer,toastUntil=0,uiSignature='',mapClock=0;
const UI={modal:$('modal'),card:$('modalCard'),labels:$('worldLabels'),hud:$('hud'),rail:$('rail'),bottom:$('bottom')};
const inventoryUI=new InventoryUI({
 state:()=>game?{bag:game.bag,source:game.panel?.sourceId?game.objs.find(o=>o.id===game.panel.sourceId):null,unlocked:game.unlocked}:null,
 close:closeInventory,take:takeLoot,drop:dropItem,use:useItem,notify:toast,changed:event=>{cargoChanged(event);const source=game?.objs.find(o=>o.id===game.panel?.sourceId);if(source)source.done=!source.loot.length;uiSignature='';},
});
function cargoChanged(event){
 if(!game)return;const incoming=event?.type==='lootAll'?event.report.moved:event?.type==='transfer'&&event.to==='bag'?[game.bag.items.find(i=>i.uid===event.uid)]:[];
 const cargo=incoming.filter(i=>i&&ITEMS[i.id].type==='commodity').sort((a,b)=>ITEMS[b.id].rarity-ITEMS[a.id].rarity);
 if(cargo.length){const d=ITEMS[cargo[0].id];toast(`已取得 ${d.name} · ${RARITIES[d.rarity].name} · ${d.value.toLocaleString()} 信用点${cargo.length>1?` · 共${cargo.length}件货品`:''}`);$('eventToast').style.setProperty('--loot-color',d.color);$('eventToast').classList.toggle('valuable',d.rarity>=4);beep(620+d.rarity*150,d.rarity>=4?.22:.1)}
 uiSignature='';updateUI();
}
function economyHTML(result){
 const list=result.items.map(i=>{const d=ITEMS[i.id];return `<li style="color:${d.color}">${d.name} · ${d.w}×${d.h} · ${d.value.toLocaleString()}</li>`}).join('')||'<li>未带出交易货品</li>';
 return `<section class="economy-result"><h3>带出货品</h3><ul class="cargo-list">${list}</ul><div class="rarity-counts">${RARITIES.map((r,i)=>`<span style="color:${r.color}">${r.name} ×${result.counts[i]}</span>`).join('')}</div><p>货品价值：${result.value.toLocaleString()}<br>搜集委托：${result.contractComplete?'完成':'未完成（可选）'} · 奖金 +${result.bonus.toLocaleString()}</p><strong>本次收益：${result.total.toLocaleString()} 信用点</strong><p>累计带出价值：${result.cumulativeValue.toLocaleString()} · 奖金余额：${result.credits.toLocaleString()}</p><small>货品以独立物品入库；价值统计不出售物品。</small></section>`;
}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(save))}catch{toast('仓库无法保存：浏览器本地存储不可用')}}
function showModal(html){UI.modal.classList.add('visible');UI.card.innerHTML=html;UI.card.querySelector?.('button')?.focus()}
function hideModal(){UI.modal.classList.remove('visible')}
function toast(message){$('eventToast').classList.remove('valuable');$('eventToast').style.removeProperty('--loot-color');$('eventToast').textContent=message;$('eventToast').classList.add('show');toastUntil=performance.now()+3000}
function beep(freq=560,time=.08,type='triangle',vol=.04){try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();let o=audioCtx.createOscillator(),g=audioCtx.createGain(),n=audioCtx.currentTime;o.type=type;o.frequency.setValueAtTime(freq,n);o.frequency.exponentialRampToValueAtTime(Math.max(90,freq*.64),n+time);g.gain.setValueAtTime(vol,n);g.gain.exponentialRampToValueAtTime(.001,n+time);o.connect(g);g.connect(audioCtx.destination);o.start(n);o.stop(n+time+.005)}catch{}}
function showGameUI(visible){for(const el of [UI.hud,UI.rail,UI.labels,UI.bottom,$('mapPanel'),$('locationLabel'),$('recruitCard'),$('navigationHUD')])el.classList.toggle('hide',!visible)}
function lobby(){
 inventoryUI.close();game=null;keys.clear();showGameUI(false);$('interact').classList.add('hide');
 const warehouse=Object.entries(save.warehouse).filter(([,q])=>q>0).map(([id,q])=>`${ITEMS[id].name} ×${q}`).join(' · ')||'尚无回收物资';
 showModal(`<div class="eyebrow">ASCENT v0.6.1 / CARGO · CONTRACTS</div><h1>ASCENT · 上行撤离</h1><p>1L独自出发，在封闭的八层研究楼内搜索与招募。<strong>前三层没有撤离口</strong>，首次上楼和每个出口都需要召唤试炼。</p><div class="result">仓库 A ${save.a?'✓':'—'} / B ${save.b?'✓':'—'}<div class="warehouse-summary">${warehouse}</div><p>累计带出价值 ${save.totalExtractedValue.toLocaleString()} · 委托奖金 ${save.credits.toLocaleString()} 信用点</p></div><p>按E立即开启试炼，<strong>圈内累积进度、出圈暂停、回圈继续</strong>；完成后再次E踏上实体楼梯或撤离。通过的楼梯可自由折返。4L—7L出口随全局时间关闭，8L最终机会暂时常开。</p><p>每局先检查实际路线、搜索战斗和试炼耗时，<strong>缩图后首个4L窗口按实际路线和搜索战斗预算重新计算</strong>，不会沿用旧三层的倒计时。具体截止时间进入后显示。</p><p>每次行动随机一项可选搜集委托；将目标货品带出获得奖金。高层深处高级 / 精英守护宝箱收益更高。</p><button class="btn" id="startButton">进入研究楼</button><button class="btn alt" id="resetButton">清除仓库进度</button><p class="small">WASD移动 · 右键/←→视角 · E启动/完成试炼 · 长按E搜索/招募 · I/Tab背包 · R旋转 · F切换目标 · Q急救 · Esc暂停。整理背包时行动继续。<br>紧凑八层 · 真实场景正常可见 · 地图保留探索迷雾 · 祭坛方向与建筑路牌 · 全队共享生命/视锥背刺/独立战利品。</p>`);
 $('startButton').onclick=start;$('resetButton').onclick=()=>{if(confirm('清除本机已入库物资与进度？')){save=migrateSave();persist();lobby()}};
}
function walkable(f,x,z){return isWalkable(f,x,z,.36)}
function newObjects(){return createWorldObjects(Math.random,Object.keys(ROLES).filter(id=>id!=='leader')).filter(o=>!(o.type==='key'&&save[o.item]))}
function start(){
 inventoryUI.close();let objs,schedule;
 for(let attempt=0;attempt<20;attempt++){
  objs=newObjects();schedule=buildExitSchedule(LEVELS,objs,STAIR_LINKS,pathTo,{stairsSeconds:TRIAL_SETTINGS.stairsSeconds,exitSeconds:TRIAL_SETTINGS.exitSeconds,stairSpeed:3,finalCloseSeconds:SETTINGS.finalExitCloseSeconds});
  if(schedule.valid)break;
 }
 if(!schedule.valid)throw Error('本次地图无法满足撤离预算：'+schedule.errors.join('；'));
 const bag=createBag(SETTINGS.bagWidth,SETTINGS.bagHeight);
 if(save.medkits>0){const deployment=withdrawWarehouse(save,bag,'med');if(deployment.ok){save=deployment.save;persist()}}
 const spawn=LEVELS[0].spawn,leaderRoles=Object.keys(ROLES).filter(id=>id!=='leader'),leaderRole=leaderRoles[Math.floor(Math.random()*leaderRoles.length)];
 game={runId:crypto.randomUUID(),contract:createContract(Math.random),status:'play',floor:1,t:0,player:{...spawn,y:0,hp:100,dir:Math.PI,fire:0,invuln:0,role:leaderRole},allies:[],objs,enemies:[],drops:[],effects:[],bullets:[],attacks:[],bag,equipped:[],equipment:{vest:false,amplifier:false},unlocked:Object.fromEntries(STAIR_LINKS.map(l=>[l.id,false])),trials:{},currentTrialId:null,transit:null,schedule,warnings:new Set(),trialEventLog:[],summonStats:{natural:0,trial:0,maxEnemies:0,unsafeSpawns:0},xp:0,level:0,upgrades:{rapid:0,pierce:0,shock:0,damage:0},spawnTimer:6,interact:null,threatNotice:1,totalKills:0,panel:null,camera:{yaw:0,pitch:.28,distance:SETTINGS.cameraDistance},visited:new Set(),landmarkMemory:new Set(),fog:createFog(LEVELS),fogClock:0,levelStates:{},awarenessLog:[],backstabs:0,dropSerial:0};
 for(const o of game.objs)if(o.type==='crate'&&!o.isDrop){o.chestTier=chestTier(o.floor,o.rare,Number(o.id.split('-').at(-1))-1);o.name=o.name.replace(/稀有箱|物资箱/,CHEST_TABLES[o.chestTier].name)}
 game.team=createTeam(game.player);game.player.id='leader';game.objs.forEach(o=>o.discovered=false);refreshFog();activateGuards();
 Object.defineProperty(game,'stored',{enumerable:true,get:()=>({a:countItem(game.bag,'a')>0,b:countItem(game.bag,'b')>0,med:countItem(game.bag,'med'),scrap:countItem(game.bag,'scrap')})});
 game.routeSigns=buildRouteSigns(game.objs);toggleMap(false);keys.clear();hideModal();showGameUI(true);uiSignature='';mapClock=0;const first=schedule.exits[0];toast(`领队：${ROLES[game.player.role].name} · 本次搜集委托：${game.contract.label}及以上 ×${game.contract.required} · 奖金 +${game.contract.bonus}；首个4L出口 ${fmt(first.closeAt)} 关闭`);updateUI();beep(880,.13);
}
function threat(){return pressureAt(game.t).tier}
function threatName(){return ['I','II','III','IV','V','VI','VII','VIII','IX','X'][threat()-1]||String(threat())}
function activeExit(f){return activeExitAt(f,game.t,game.schedule)}
function nearbyCandidates(){if(!game)return[];return game.objs.filter(o=>o.floor===game.floor&&!o.done&&distance(o,game.player)<2.7&&isLineClear(game.floor,game.player,o,.05)).sort((a,b)=>distance(a,game.player)-distance(b,game.player))}
function nearby(){const candidates=nearbyCandidates();return candidates.find(o=>o.id===game?.focusId)||candidates[0]||null}
function openInventory(source=null){if(!game||game.status!=='play')return;keys.clear();game.interact=null;game.panel={sourceId:source?.id||null};inventoryUI.show()}
function closeInventory(){inventoryUI.close();if(game)game.panel=null;keys.clear()}
function makeLoot(o){
 if(!o.loot){o.chestTier??=chestTier(o.floor,o.rare);const pool=o.rare?['med','vest','amplifier','battery']:['med','battery','med','vest'];o.loot=rollCargo(o.chestTier,Math.random);
  for(let i=0,count=2+Math.floor(Math.random()*2);i<count;i++)o.loot.push({id:pool[Math.floor(Math.random()*pool.length)],qty:1});
 }containerBag(o);
}
function collect(o){
 if(o.done)return false;game.interact=null;game.focusId=null;
 if(o.type==='recruit'){
  if(game.allies.length>=3){toast('小队已满：最多领队与三名队员');return false}
  const role=ROLES[o.role],member={id:o.id,role:o.role,x:o.x,y:LEVELS[game.floor-1].baseY,z:o.z,fire:0,dir:game.player.dir,phase:Math.random()*5};
  const result=recruitMember(game,member,role.hpContribution);if(!result.ok)return false;o.done=true;refreshFog();toast(`${role.name}加入 · 共享生命 +${role.hpContribution} → ${Math.ceil(game.team.hp)}/${game.team.maxHp}`);beep(740,.24);
 }else if(o.type==='key'){
  if(!o.loot)o.loot=normalizeLoot([{id:o.item,qty:1}]);const source=containerBag(o),r=transferItem(source,game.bag,source.items[0].uid);if(!r.ok){toast('背包空间不足：整理或旋转后再取关键资源');return false}o.done=true;toast(`已取得关键资源 ${o.item.toUpperCase()} · 占用 ${ITEMS[o.item].w}×${ITEMS[o.item].h} 格`);beep(1140,.25);
 }else if(o.type==='crate'){makeLoot(o);o.opened=true;openInventory(o)}
 uiSignature='';return true;
}
function takeLoot(index){
 const o=game?.objs.find(o=>o.id===game.panel?.sourceId);if(!o)return;const source=containerBag(o),item=source.items[index];if(!item)return;
 const r=transferItem(source,game.bag,item.uid);if(!r.ok){toast('背包空间不足：物资仍在容器中');return false}
 o.done=!o.loot.length;uiSignature='';beep(600,.05);inventoryUI.refresh();return true;
}
function dropItem(uid,side='bag'){
 if(!game)return;const source=side==='source'?game.objs.find(o=>o.id===game.panel?.sourceId):null;
 const bag=source?containerBag(source):game.bag,item=removeItem(bag,uid);if(!item)return;
 if(source)source.done=!source.loot.length;
 const p=game.player;game.objs.push({id:`dropped-${++game.dropSerial}`,floor:game.floor,x:p.x,z:p.z,type:'crate',name:`丢弃：${ITEMS[item.id].name}`,done:false,discovered:true,opened:true,isDrop:true,loot:[item]});
 toast(`${ITEMS[item.id].name}已丢在原地，可重新拾取`);uiSignature='';
}
function useItem(uid){
 if(!game)return;const item=game.bag.items.find(i=>i.uid===uid);if(!item)return;
 if(item.id==='med'||item.id==='battery'){
  if(game.team.hp>=game.team.maxHp){toast('当前生命已满');return}const heal=item.id==='med'?40:20;removeItem(game.bag,uid,1);healTeam(game,heal);toast(`使用${ITEMS[item.id].name} · 生命 +${heal}`);beep(790,.13);
 }else if(item.id==='vest'||item.id==='amplifier'){
  if(game.equipment[item.id]){toast('本趟已装备同类物品');return}const equipped=removeItem(game.bag,uid,1);game.equipment[item.id]=true;game.equipped.push(equipped);toast(`已装备${ITEMS[item.id].name} · 本趟生效，成功撤离后入库`);
 }else toast('此物品只能携带撤离入库，不能直接使用');
 uiSignature='';inventoryUI.refresh();
}
function trialFor(o){if(!game.trials[o.id])game.trials[o.id]=createTrial(o);return game.trials[o.id]}
function exitDeadline(o){return o.type==='exit'?game.schedule.exits.find(e=>e.objectId===o.id)?.closeAt:null}
function trialEvent(event){
 if(!event||event.type==='wave')return;
 game.navigation=null;
 game.trialEventLog.push({...event,t:game.t});if(game.trialEventLog.length>120)game.trialEventLog.shift();
 const o=game.objs.find(o=>o.id===event.objectId),kind=o?.type==='exit'?'撤离':'上行';
 const messages={started:`${kind}召唤试炼开始 · 留在圆圈内`,paused:'离开圆圈 · 试炼进度暂停，战斗继续',resumed:'回到圆圈 · 试炼进度恢复',completed:`${kind}试炼完成 · 返回标记旁再次按E使用`,failed:'撤离口已关闭 · 试炼立即失败，请继续向上'};
 if(event.type==='completed'&&o?.type==='stairsUp')game.unlocked[o.gate]=true;
 if(event.type==='started'&&o?.floor===game.floor)for(const e of game.enemies){
  if(!['idle','search'].includes(e.awareness)||distance(e,o)>22)continue;
  const route=pathTo(game.floor,e,o),length=route.slice(1).reduce((n,p,i)=>n+distance(p,route[i]),0);
  if(route.length&&length<=22){e.awareness='search';e.lastKnown={x:o.x,z:o.z,y:LEVELS[game.floor-1].baseY,floor:game.floor};e.searchTimer=length/ENEMIES[e.kind].speed+5}
 }
 if(messages[event.type])toast(messages[event.type]);beep(event.type==='failed'?155:event.type==='completed'?960:560,.14);uiSignature='';
}
function updateExitStates(){
 for(const e of game.schedule.exits){if(e.closeAt===null)continue;const remaining=e.closeAt-game.t;
  for(const seconds of [60,30,10]){const id=`${e.objectId}:${seconds}`;if(remaining>0&&remaining<=seconds&&!game.warnings.has(id)){game.warnings.add(id);toast(`${e.floor}L出口即将关闭 · 剩余${Math.ceil(remaining)}秒`);beep(260,.18,'sawtooth')}}
  const id=`${e.objectId}:closed`;if(remaining<=0&&!game.warnings.has(id)){game.warnings.add(id);game.navigation=null;toast(`${e.floor}L撤离口关闭！已通过的楼梯仍可双向通行`);beep(150,.22,'sawtooth');uiSignature=''}
 }
}
function updateTrials(dt){
 for(const trial of Object.values(game.trials)){
  const o=game.objs.find(o=>o.id===trial.objectId);
  const events=tickTrial(trial,dt,{now:game.t,player:{...game.player,floor:game.transit?-1:game.floor},closeAt:exitDeadline(o),enemyCount:game.enemies.filter(e=>e.alive).length,enemyLimit:pressureAt(game.t).cap,waveCount:Math.min(3,1+Math.floor((trial.floor-1)/3)),spawn:summonWave});
  events.forEach(trialEvent);
 }
}
function interactPress(){
 if(!game||game.status!=='play'||game.panel||game.transit)return;const o=nearby();if(!o)return;
 if(o.type==='stairsDown'){changeFloor(-1);return}
 if(o.type!=='stairsUp'&&o.type!=='exit')return;
 if(o.type==='exit'&&!activeExit(game.floor)){toast('本层撤离口已关闭，无法启动或完成试炼；请向更高层前进');return}
 if(o.type==='stairsUp'&&game.unlocked[o.gate]){changeFloor(1);return}
 const trial=trialFor(o);game.currentTrialId=o.id;
 if(canUseTrial(trial,game.t,exitDeadline(o))){if(o.type==='exit')extract();else changeFloor(1);return}
 const result=startTrial(trial,game.t,exitDeadline(o));if(result.event)trialEvent(result.event);
 else if(trial.status==='running'||trial.status==='paused')toast('试炼进行中：站在圈内积累，完成后再次按E');
}
function changeFloor(d){
 if(!game||game.status!=='play'||game.transit)return false;const next=game.floor+d;if(next<1||next>LEVELS.length)return false;
 const gate=`gate${d>0?game.floor:next}`;if(!game.unlocked[gate]){toast('上行试炼尚未完成');return false}
 const o=game.objs.find(o=>o.floor===game.floor&&o.type===(d>0?'stairsUp':'stairsDown'));
 if(!o||distance(o,game.player)>2.7)return false;
 const link=STAIR_LINKS.find(l=>l.id===gate);
 const actors=[game.player,...game.allies].map(a=>({...a,approachPath:pathTo(game.floor,a,o).map(p=>({...p,y:LEVELS[game.floor-1].baseY}))}));
 game.transit=createTransit(link,game.floor,actors,3);closeInventory();keys.clear();toast(`进入实体楼梯井 · ${game.floor}L → ${next}L · 行动时间继续`);return true;
}
function advanceStairs(dt){
 if(!game.transit)return;const transit=game.transit,frame=tickTransit(transit,dt);
 [game.player,...game.allies].forEach((a,i)=>{const p=frame.poses[i];if(Math.hypot(p.x-a.x,p.z-a.z)>.001)a.dir=Math.atan2(p.x-a.x,p.z-a.z);Object.assign(a,p)});
 if(frame.done){game.levelStates[game.floor]={enemies:game.enemies,drops:game.drops};game.floor=transit.toFloor;game.transit=null;const previous=game.levelStates[game.floor];game.enemies=previous?.enemies||[];game.drops=previous?.drops||[];game.bullets=[];game.effects=[];game.attacks=[];game.spawnTimer=3;activateGuards();refreshFog();game.interact=null;game.currentTrialId=null;game.focusId=null;uiSignature='';toast(`已抵达 ${game.floor}L · 上下楼不重置全局时间`)}
}
const upgrades=[{id:'rapid',title:'高速射击',detail:'整队攻击间隔减少18%，适合速射与弹射构筑。'},{id:'pierce',title:'穿透弹丸',detail:'领队额外贯穿一名同一直线敌人，墙体仍会阻挡。'},{id:'shock',title:'周期震荡',detail:'领队每4秒释放真实范围伤害、击退和眩晕。'},{id:'damage',title:'脉冲增幅',detail:'所有自动攻击伤害提高20%，本趟持续。'}];
function gainXp(n){
 if(!game||n<0)return;game.xp+=n;const req=SETTINGS.xpMilestones[game.level];if(req===undefined||game.xp<req)return;
 game.status='upgrade';closeInventory();keys.clear();showModal(`<div class="eyebrow">KILL EXPERIENCE / PERK</div><h2>选择本次行动强化</h2><p>仅怪物击杀经验提供升级；搜索、招募不会提供经验。行动计时已暂停。</p><div class="choices">${upgrades.map(x=>`<button class="choice" data-upgrade="${x.id}"><b>${x.title}</b><span>${x.detail}</span></button>`).join('')}</div>`);
 document.querySelectorAll('[data-upgrade]').forEach(button=>button.onclick=()=>{game.upgrades[button.dataset.upgrade]++;game.level++;game.status='play';hideModal();uiSignature='';beep(1050,.20);gainXp(0)});
}
function extract(){
 if(!game||game.status!=='play'||game.transit)return false;const o=nearby();if(!o||o.type!=='exit'||!activeExit(game.floor))return false;
 const trial=game.trials[o.id];if(!trial||!canUseTrial(trial,game.t,exitDeadline(o)))return false;
 game.status='end';closeInventory();const result=settleEconomy(game,save,true,bagItems(game.bag));save=bankRun(save,{items:[...bagItems(game.bag),...game.equipped]});persist();
 const goods=[...bagItems(game.bag),...game.equipped].map(i=>`${ITEMS[i.id].name} ×${i.qty}`).join('、')||'空手撤离';
 showModal(`<div class="eyebrow">EXTRACTION COMPLETE</div><h2>已成功撤离</h2><p class="success">召唤试炼完成后，在出口关闭前带回了物资。</p><div class="result">${goods}<br>${game.floor}L · 用时 ${fmt(game.t)} · 击杀 ${game.totalKills} · 小队 ${game.allies.length+1}/4</div>${economyHTML(result)}<p>本次携带和装备已入库；临时队员、Perk与楼梯试炼下局重新开始。</p><button class="btn" id="retryButton">再次探索</button><button class="btn alt" id="menuButton">返回主界面</button>`);
 $('retryButton').onclick=start;$('menuButton').onclick=lobby;beep(1120,.3);return true;
}
function die(){
 if(!game||game.status!=='play')return;game.status='end';closeInventory();settleEconomy(game,save,false,bagItems(game.bag));const lost=[...bagItems(game.bag),...game.equipped].map(i=>`${ITEMS[i.id].name}×${i.qty}`).join('、')||'无';
 showModal(`<div class="eyebrow">MISSION FAILED</div><h2>撤离失败</h2><p class="warning">失去本趟未入库物资：${lost}</p><p>搜集委托未完成 · 奖金 +0 · 本次收益 0 信用点</p><p>之前入库的物资安全保留；临时队员、本趟强化与楼梯试炼将在重开时重置。</p><button class="btn" id="retryButton">重新独自出发</button><button class="btn alt" id="menuButton">返回主界面</button>`);
 $('retryButton').onclick=start;$('menuButton').onclick=lobby;beep(150,.35,'sawtooth');
}
function move(x,z,dt,entity,speed){
 let dx=x-entity.x,dz=z-entity.z,d=Math.hypot(dx,dz);if(d<.001)return;const step=Math.min(d,speed*dt);dx=dx/d*step;dz=dz/d*step;
 const nx=entity.x+dx,nz=entity.z+dz,f=game.floor;
 if(walkable(f,nx,nz)){entity.x=nx;entity.z=nz}else{if(walkable(f,nx,entity.z))entity.x=nx;if(walkable(f,entity.x,nz))entity.z=nz}
}
function pathTarget(e,target=game.player){return navigationTarget(game.floor,e,target)}
function lineClear(a,b){
 const fy=LEVELS[game.floor-1].baseY;if(Math.abs((a.y??fy)-(b.y??fy))>1.4)return false;
 return isLineClear(game.floor,a,b,.12);
}
function spawnGroup(count,center=null){
 const level=threat(),pressure=pressureAt(game.t),cap=pressure.cap-(center?0:2),circles=Object.values(game.trials).filter(t=>t.floor===game.floor&&['running','paused'].includes(t.status));let added=0;
 for(let n=0;n<count&&game.enemies.length<cap;n++)for(let attempt=0;attempt<80;attempt++){
  const anchor=center||game.player,angle=Math.random()*Math.PI*2,r=center?8+Math.random()*5:13+Math.random()*12,p={x:anchor.x+Math.sin(angle)*r,z:anchor.z+Math.cos(angle)*r};
  if(distance(p,game.player)<7.5||(center&&distance(p,center)<center.radius+1.5)||!isWalkable(game.floor,p.x,p.z,.6)||!pathTo(game.floor,p,game.player).length)continue;
  if(circles.some(t=>distance(p,t)<t.radius+1.5))continue;
  const trialRoute=center?pathTo(game.floor,p,center):null,trialDistance=trialRoute?trialRoute.slice(1).reduce((n,q,i)=>n+distance(q,trialRoute[i]),0):0;
  if(center&&(!trialRoute.length||trialDistance>22))continue;
  if(!center&&distance(p,game.player)<18&&lineClear(p,game.player))continue;
  const roll=Math.random(),eliteChance=game.floor>=4?pressure.eliteChance:Math.min(.2,.025+(level-1)*.015);
  const kind=roll<eliteChance?'elite':Math.random()<pressure.rangedChance?'ranged':'melee',e=makeEnemy(kind,p.x,p.z,game.floor);e.y=LEVELS[game.floor-1].baseY;e.dir=Math.random()*Math.PI*2;e.origin=center?'trial':'natural';game.enemies.push(e);added++;
  if(center){e.awareness='search';e.lastKnown={x:center.x,z:center.z,y:e.y,floor:game.floor};e.searchTimer=trialDistance/ENEMIES[kind].speed+5}
  game.summonStats[center?'trial':'natural']++;game.summonStats.maxEnemies=Math.max(game.summonStats.maxEnemies,game.enemies.length);break;
 }
 return added;
}
function spawn(){return spawnGroup(pressureAt(game.t).batch)}
function summonWave(floor,center,count){if(floor!==game.floor||game.transit)return 0;return spawnGroup(count,center)}
function onKill(enemy){
 const spec=ENEMIES[enemy.kind];game.drops.push({kind:'xp',x:enemy.x,z:enemy.z,life:45,value:spec.xp});
 if(Math.random()<spec.dropChance){const pool=['med','battery','med','vest'];const id=pool[Math.floor(Math.random()*pool.length)];game.objs.push({id:`enemy-drop-${++game.dropSerial}`,floor:game.floor,x:enemy.x,z:enemy.z,type:'crate',name:`${spec.name}掉落`,done:false,opened:true,isDrop:true,loot:normalizeLoot([rollCargoSlot(chestTier(game.floor,enemy.kind==='elite'),Math.random),{id,qty:enemy.kind==='elite'?2:1}]),discovered:false})}
}
function damageActor(actor,amount){
 if(game.status!=='play'||Math.abs((actor.y??0)-LEVELS[game.floor-1].baseY)>1.4)return 0;
 const actual=damageTeam(game,actor,amount*(game.equipment.vest?.8:1));if(actual){uiSignature='';beep(155,.07,'sawtooth',.02);if(game.team.hp<=0)die()}return actual;
}
function damagePlayer(amount){return damageActor(game.player,amount)}
function visiblePoint(p){return pointVisible(game.fog,game.floor,p,[game.player,...game.allies],(a,b)=>isLineClear(game.floor,a,b,.05))}
function refreshFog(){
 updateFog(game.fog,game.floor,[game.player,...game.allies],(a,b)=>isLineClear(game.floor,a,b,.05),{points:game.objs.filter(o=>o.floor===game.floor&&!o.done)});
 for(const o of game.objs)if(o.floor===game.floor&&!o.done&&visiblePoint(o))o.discovered=true;
 const landmark=landmarkAnchors[game.floor-1];if(landmark&&visiblePoint(landmark))game.landmarkMemory.add(game.floor);
 game.fogClock=0;activateGuards();
}
function activateGuards(){
 const cap=pressureAt(game.t).cap-2,floor=game.floor;let count=0;
 for(const o of game.objs){if(o.floor!==floor||!o.guardSpawns||o.guardsSpawned)continue;
  o.guardSpawnsPending??=[...o.guardSpawns];
  o.guardSpawnsPending=o.guardSpawnsPending.filter(p=>{
   if(game.enemies.length>=cap||distance(p,game.player)<7.5||game.allies.some(a=>distance(p,a)<2)||Object.values(game.trials).some(t=>t.floor===floor&&['running','paused'].includes(t.status)&&distance(p,t)<t.radius+1.5))return true;
   const e=makeEnemy(p.kind,p.x,p.z,floor);e.y=LEVELS[floor-1].baseY;e.dir=Math.random()*Math.PI*2;e.origin='guard';game.enemies.push(e);count++;return false;
  });o.guardsSpawned=!o.guardSpawnsPending.length;
 }return count;
}
function update(dt){
 if(!game||game.status!=='play')return;const s=game;s.t+=dt;for(const a of [s.player,...s.allies]){a.invuln=Math.max(0,(a.invuln||0)-dt);a.hurt=Math.max(0,(a.hurt||0)-dt)}updateExitStates();updateTrials(dt);
 if(threat()>s.threatNotice){s.threatNotice=threat();toast(`危险升级 · 全图威胁 ${threatName()}`)}
 if(s.transit){advanceStairs(dt)}else{
  if(!s.panel){s.camera.yaw+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*1.7;
   let sx=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),sy=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
   if(sx||sy){const l=Math.hypot(sx,sy);sx/=l;sy/=l;const y=s.camera.yaw,dx=Math.cos(y)*sx-Math.sin(y)*sy,dz=-Math.sin(y)*sx-Math.cos(y)*sy;move(s.player.x+dx,s.player.z+dz,dt,s.player,SETTINGS.playerMoveSpeed);s.player.dir=Math.atan2(dx,dz)}
  }
  s.player.y=LEVELS[s.floor-1].baseY;
  for(let i=0;i<s.allies.length;i++){const a=s.allies[i],p=s.player,side=(i%2?1:-1)*.8,back=1.2+Math.floor(i/2)*1.2,target={x:p.x-Math.sin(p.dir)*back+Math.cos(p.dir)*side,z:p.z-Math.cos(p.dir)*back-Math.sin(p.dir)*side};if(distance(a,p)>1.2){const dest=walkable(s.floor,target.x,target.z)&&lineClear(a,target)?target:pathTarget(a);move(dest.x,dest.z,dt,a,6.5)}a.y=LEVELS[s.floor-1].baseY}
 }
 s.spawnTimer-=dt;if(s.spawnTimer<=0){spawn();s.spawnTimer=pressureAt(s.t).interval}
 stepCombat(s,dt,{move,pathTarget,lineClear,walkable:(x,z)=>walkable(s.floor,x,z),onKill,damagePlayer,damageActor,random:Math.random,threat,onAwareness:(e,state)=>{s.awarenessLog.push({kind:e.kind,state,t:s.t});if(s.awarenessLog.length>80)s.awarenessLog.shift()},onDamage:event=>{if(event.backstab)s.backstabs++}});s.enemies=s.enemies.filter(e=>e.alive);s.fogClock+=dt;if(s.fogClock>=.12)refreshFog();if(s.status!=='play')return;
 for(const orb of s.drops){orb.life-=dt;if(!s.transit&&distance(orb,s.player)<1.65){orb.life=-1;gainXp(orb.value);if(s.status!=='play')break}}s.drops=s.drops.filter(o=>o.life>0);if(s.status!=='play'||s.transit)return;
 const o=nearby();if(!s.panel&&keys.has('KeyE')&&o&&['crate','key','recruit'].includes(o.type)){if(s.interact?.id!==o.id)s.interact={id:o.id,p:0};s.interact.p+=dt;if(s.interact.p>=SETTINGS.lootSeconds[o.type]){collect(o);keys.delete('KeyE')}}else s.interact=null;
}
function updateUI(){
 if(!game)return;const s=game,req=SETTINGS.xpMilestones[s.level],o=nearby();updateNavigationHUD();
 const trial=s.trials[s.currentTrialId]||Object.values(s.trials).find(t=>t.floor===s.floor&&['running','paused'].includes(t.status));
 const signature=[fmt(s.t),Math.ceil(s.player.hp),s.team.maxHp,s.floor,s.allies.length,s.xp,s.level,occupiedCells(s.bag),countItem(s.bag,'med'),o?.id,s.interact?.id,Math.floor((s.interact?.p||0)*10),trial?.status,Math.floor((trial?.progress||0)*10),Math.floor((s.transit?.elapsed||0)*10),JSON.stringify(s.unlocked)].join('|');if(signature===uiSignature)return;uiSignature=signature;
 $('clock').textContent=fmt(s.t);$('hpNumber').textContent=`${Math.ceil(s.team.hp)}/${s.team.maxHp}`;$('healthFill').style.width=`${s.team.hp/s.team.maxHp*100}%`;$('squadSize').textContent=`${s.allies.length+1}/4`;
 $('squadPortraits').innerHTML=[{role:s.player.role},...s.allies,...Array(3-s.allies.length).fill({role:'empty'})].map(a=>`<div class="portrait ${a.role==='empty'?'empty':''}" title="${ROLES[a.role]?.description||'空队员槽位'}" style="color:${COLORS[a.role]||'#608090'}"><span>${ROLES[a.role]?.icon||'+'}</span><small>${ROLES[a.role]?.name||'可招募'}</small></div>`).join('');
 $('levelNumber').textContent=`LV ${s.level+1}`;$('xpText').textContent=req?`${s.xp}/${req}`:'MAX';$('xpFill').style.width=req?`${Math.min(100,s.xp/req*100)}%`:'100%';$('perkList').textContent=upgrades.filter(p=>s.upgrades[p.id]>0).map(p=>`${p.title}×${s.upgrades[p.id]}`).join(' · ')||'仅击杀经验提供Perk';
 $('threatText').textContent=`威胁 ${threatName()}`;[...$('threatBars').children].forEach((e,i)=>e.classList.toggle('on',i<threat()));$('floorName').textContent=`${s.floor}L / ${FLOOR_NAMES[s.floor-1]}`;
 $('exitRows').innerHTML=s.schedule.exits.map(e=>`<div class="exit-row ${activeExit(e.floor)?'':'locked'} ${s.floor===e.floor?'current':''}"><span>${e.floor}L ${e.floor===8?'最终机会':'撤离口'}</span><b class="${activeExit(e.floor)?'live':'dead'}">${e.closeAt===null?'持续开放':activeExit(e.floor)?fmt(e.closeAt-s.t):'已关闭'}</b></div>`).join('');
 $('inventory').innerHTML=`背包 ${occupiedCells(s.bag)}/48 格 · A ${countItem(s.bag,'a')} / B ${countItem(s.bag,'b')}<br>上行试炼已通过 ${Object.values(s.unlocked).filter(Boolean).length}/7`;
 const cp=progressContract(s.contract,s.bag.items),cv=summarizeCargo(s.bag.items);$('contractHUD').innerHTML=`<b>搜集委托：${s.contract.label}+ ${Math.min(cp.count,cp.required)}/${cp.required}</b><small>${cp.complete?'已携带目标物品 · 待撤离确认':'可选目标 · 带出后结算'} · 奖金 +${s.contract.bonus}</small><span>携带货品 ${cv.value.toLocaleString()} 信用点</span>`;$('contractHUD').classList.toggle('ready',cp.complete);
 $('objectives').textContent=s.floor<4?'1L—3L无出口 · 完成上行试炼':'出口关闭前通过试炼，再E撤离';
 const first=s.schedule.exits[0];$('budgetHint').textContent=`首窗 ${fmt(first.closeAt)} · 探索预算 ${fmt(first.budget.totalSeconds)} + 至少90秒余量`;
 $('medkits').textContent=`Q 急救 ×${countItem(s.bag,'med')} · 电池 ×${countItem(s.bag,'battery')}`;$('saved').textContent=`仓库 A:${save.a?'✓':'—'} / B:${save.b?'✓':'—'}`;
 $('railRows').innerHTML=[...LEVELS].reverse().map(l=>`<div class="rail-floor ${l.floor===s.floor?'active':''} ${l.floor>=4&&!activeExit(l.floor)?'locked':''}">${l.floor}L ${l.floor===s.floor?'◉':l.floor<4?'—':activeExit(l.floor)?'◇':'×'}</div>`).join('');
 const room=LEVELS[s.floor-1].rooms.find(r=>Math.abs(s.player.x-r.x)<r.w/2&&Math.abs(s.player.z-r.z)<r.d/2);$('locationLabel').textContent=s.transit?`实体楼梯井 · ${s.transit.fromFloor}L → ${s.transit.toFloor}L`:`${s.floor}L · ${room?.name||'环廊 / 维护通道'}`;
 updateRecruitCard(o);$('fogStatus').textContent=`小队视野 · 已探索 ${fogSummary(s.fog).find(f=>f.floor===s.floor)?.known||0}格`;
 const panel=$('interact');if(s.panel){panel.classList.add('hide');return}let text='',progress=0;
 if(s.transit){progress=s.transit.elapsed/s.transit.duration;text=`踏过楼梯 ${Math.round(progress*100)}% · 全局时间继续`}
 else if(trial&&trial.floor===s.floor&&['running','paused'].includes(trial.status)){progress=trial.progress/trial.duration;text=`${trial.kind==='exit'?'撤离':'上行'}试炼 ${Math.floor(progress*100)}% · ${trial.status==='paused'?'圈外暂停，回圈继续':'留在圈内生存'}`}
 else if(s.interact&&o){progress=s.interact.p/SETTINGS.lootSeconds[o.type];text=`搜索中：${o.name}`}
 else if(o){text=o.type==='stairsUp'?s.unlocked[o.gate]?'E 进入实体楼梯 · 已完成试炼':'E 立即召唤上行试炼':o.type==='stairsDown'?'E 下行 · 双向已解锁':o.type==='exit'?exitCaption(s,o):o.type==='recruit'?`长按E招募 ${ROLES[o.role].name} · ${ROLES[o.role].description}`:`长按E搜索 · ${o.name}`}
 panel.classList.toggle('hide',!text);$('interactCaption').textContent=text;$('interactProgress').style.width=`${clamp(progress*100,0,100)}%`;
}
function updateRecruitCard(o){
 if(o?.type!=='recruit')o=game.objs.filter(o=>o.floor===game.floor&&o.type==='recruit'&&!o.done&&distance(o,game.player)<10&&visiblePoint(o)).sort((a,b)=>distance(a,game.player)-distance(b,game.player))[0];
 const card=$('recruitCard');const eligible=o?.type==='recruit'&&!o.done&&visiblePoint(o)&&!game.panel&&!game.transit;
 card.classList.toggle('hide',!eligible);if(!eligible)return;
 const role=ROLES[o.role],full=game.allies.length>=3,close=nearbyCandidates().includes(o);
 card.innerHTML=`<div class="micro">发现成员 · ${game.allies.length+1}/4</div><b style="color:${role.color}">${role.icon} ${role.name} · +${role.hpContribution} HP</b><span>${role.position}</span><p>${role.description}</p><small>招募后 ${Math.ceil(game.team.hp)+role.hpContribution}/${game.team.maxHp+role.hpContribution} · 保留已有伤势</small><button id="recruitButton" class="hud-button" ${full||!close?'disabled':''}>${full?'小队已满':close?'招募 · 或长按 E':'靠近后招募'}</button>`;
 $('recruitButton').onclick=()=>{if(!full&&nearbyCandidates().includes(o))collect(o)};
}
function pause(){closeInventory();keys.clear();game.status='paused';showModal('<div class="eyebrow">PAUSED</div><h2>研究塔暂时静止</h2><p>行动时钟、敌人、攻击与搜索进度都已暂停。</p><button id="resumeButton" class="btn">继续行动</button><button id="exitMenu" class="btn alt">放弃本次行动</button>');$('resumeButton').onclick=()=>{game.status='play';hideModal()};$('exitMenu').onclick=lobby}
function keyDown(e){
 if(['KeyW','KeyS','KeyA','KeyD','KeyE','KeyQ','KeyI','KeyF','Tab','Escape','KeyR','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
 if(e.repeat&&!['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))return;
 if(game&&inventoryUI.open&&inventoryUI.key(e))return;
 if(e.code==='Escape'&&game){if($('mapPanel').classList.contains('expanded')){toggleMap(false);return}if(inventoryUI.open){closeInventory();return}if(game.status==='play'){pause();return}if(game.status==='paused'){game.status='play';hideModal();return}}
 if(!game||game.status!=='play')return;
 if(e.code==='KeyM'){toggleMap();return}
 if(e.code==='KeyI'||e.code==='Tab'){if(inventoryUI.open)closeInventory();else openInventory();return}
 if(QA_MODE&&['Digit1','Digit2','Digit3'].includes(e.code)){game.t={Digit1:game.schedule.exits[0].closeAt-5,Digit2:game.schedule.exits[1].closeAt-5,Digit3:game.schedule.exits[3].closeAt+1}[e.code];toast('辅助QA时间定位，不计作正常游玩');return}
 if(game.panel||game.transit)return;if(e.code==='KeyF'){const list=nearbyCandidates(),current=nearby();if(list.length>1){game.focusId=list[(list.indexOf(current)+1)%list.length].id;toast(`交互目标：${nearby().name}`)}return}keys.add(e.code);if(e.code==='KeyE')interactPress();if(e.code==='KeyQ'){const med=game.bag.items.find(i=>i.id==='med')||game.bag.items.find(i=>i.id==='battery');if(med)useItem(med.uid);else toast('没有医疗补给：深入房间搜索急救包或医疗电池')}
}
addEventListener('keydown',keyDown);addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyE'&&game)game.interact=null});
addEventListener('blur',()=>{keys.clear();if(game?.status==='play')pause()});
$('mapButton').onclick=()=>toggleMap();$('closeMap').onclick=()=>toggleMap(false);
$('bagButton').onclick=()=>{if(inventoryUI.open)closeInventory();else openInventory()};
let orbiting=false;const canvas=$('world');canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(e.button===2&&game?.status==='play'&&!game.panel){orbiting=true;canvas.setPointerCapture?.(e.pointerId)}});
addEventListener('pointerup',()=>{orbiting=false});addEventListener('pointermove',e=>{if(orbiting&&game?.status==='play'&&!game.panel){game.camera.yaw-=e.movementX*.006;game.camera.pitch=clamp(game.camera.pitch+e.movementY*.004,.10,.65)}});
canvas.addEventListener('wheel',e=>{if(game?.status==='play'&&!game.panel){e.preventDefault();game.camera.distance=clamp(game.camera.distance+e.deltaY*.01,3.5,10)}},{passive:false});

function drawPerson(g,a,fy,role,enemy=false,t=0){
 const cameraGap=g.eye?Math.hypot(g.eye[0]-a.x,g.eye[2]-a.z):99;
 if(!enemy&&cameraGap<1.45)return;
 const actorAlpha=enemy?1:clamp((cameraGap-1.45)/.9,.12,1);
 fy=Number.isFinite(a.y)?a.y:fy;
 const scale=enemy?ENEMIES[a.kind]?.scale||1:1,x=a.x,z=a.z,turn=a.dir||0,col=enemy?(a.hit>0?'#fff0ad':a.freeze>0?'#8bdbff':ENEMIES[a.kind]?.color||COLORS.enemy):COLORS[role]||COLORS.leader;
 const draw=(shape,p,size,color,r=0,alpha=1)=>g.draw(shape,[x+p[0]*scale,fy+p[1]*scale,z+p[2]*scale],size.map(v=>v*scale),color,r,alpha*actorAlpha);
 draw('cyl',[0,.035,0],[.85,.04,.85],enemy?'#823d4e':'#3f929a',0,.65);
 const bob=Math.sin(t*6+(a.phase||0))*.035;draw('box',[0,.80+bob,0],[.62,.85,.46],col,turn);draw('oct',[0,1.4+bob,0],[.60,.62,.58],enemy?col:'#c4ecf1',turn);
 for(const dx of [-.16,.16])draw('box',[dx,.26,0],[.22,.48,.26],enemy?'#713345':'#283e56');
 if(!enemy){draw('box',[0,1.46,.28],[.4,.15,.15],'#17384d',turn);const melee=['heavy','berserker'].includes(role);draw('box',[.35,.86,.28],melee?[.28,.28,.9]:[.18,.22,role==='sniper'?1.1:.65],COLORS[role]||'#385266',turn);if(role==='heavy')draw('box',[-.38,1,0],[.25,.7,.6],'#a08762',turn)}
 else if(a.kind==='ranged')draw('oct',[0,1.0,.30],[.64,.72,.58],'#f9cb72',turn);
 else if(a.kind==='elite'){draw('box',[-.45,.9,0],[.38,.8,.5],'#935cbb',turn);draw('box',[.45,.9,0],[.38,.8,.5],'#935cbb',turn)}
}
function inView(p,range=32){const l=LEVELS[game.floor-1],floorExtent=Math.max(l.width,l.height)*l.cellSize;range=Math.max(range,floorExtent);return Math.abs(p.x-game.player.x)<=range+(p.w||0)/2&&Math.abs(p.z-game.player.z)<=range+(p.d||0)/2}

function cameraBlocked(x,z,y){
 const floor=clamp(Math.floor(Math.max(0,y)/FLOOR_HEIGHT)+1,1,8),l=LEVELS[floor-1];
 const shaft=l.stairwells.some(r=>Math.abs(x-r.x)<r.w/2&&Math.abs(z-r.z)<r.d/2);
 if(shaft&&game.transit)return false;
 if(!isWalkable(floor,x,z,.22))return true;
 return y>l.baseY+WALL_HEIGHT-.22&&!shaft;
}
function drawTrialCircle(g,trial,fy){
 const color=trial.status==='completed'?'#78f4b9':trial.status==='failed'?'#f57b7d':trial.status==='paused'?'#edaa6a':'#a9a0ff';
 const progress=trial.progress/trial.duration;
 for(let i=0;i<48;i++){const a=i*Math.PI/24,x=trial.x+Math.cos(a)*trial.radius,z=trial.z+Math.sin(a)*trial.radius;if(isWalkable(trial.floor,x,z,.04))g.draw('box',[x,fy+.045,z],[.21,.06,.21],i/48<progress?'#7cf0c1':color)}
 if(['running','paused'].includes(trial.status))for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){if(x*x+z*z>trial.radius*trial.radius)continue;const px=trial.x+x,pz=trial.z+z;if(isWalkable(trial.floor,px,pz,.1))g.draw('box',[px,fy+.018,pz],[.85,.025,.85],color,0,.12)}
}
function toggleMap(force){
 const panel=$('mapPanel'),expanded=force??!panel.classList.contains('expanded');panel.classList.toggle('expanded',expanded);
 const map=$('minimap');map.width=expanded?600:240;map.height=expanded?600:200;if(game)drawMinimap();
}
function buildRouteSigns(objects){
 const out=[];
 for(const o of objects.filter(o=>o.type==='stairsUp'||o.type==='exit')){
  const l=LEVELS[o.floor-1],route=pathTo(o.floor,l.spawn,o);let since=0;
  for(let i=1;i<route.length-1;i++){since+=distance(route[i],route[i-1]);
   const a=route[i-1],p=route[i],b=route[i+1],turn=Math.abs((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x))>.01;
   if(since>=8&&(turn||since>=14)&&distance(p,o)>5){out.push({floor:o.floor,x:p.x,z:p.z,type:o.type,targetId:o.id,dir:Math.atan2(b.x-p.x,b.z-p.z),color:o.type==='exit'?'#68efbf':'#ffd16b'});since=0}
  }
 }return out;
}
function altarColor(o,state){return state.status==='closed'?'#f17b7f':o.type==='exit'?'#64e8bb':'#ffc65c'}
function drawRouteSign(g,sign,fy){
 const dx=Math.sin(sign.dir),dz=Math.cos(sign.dir),sx=Math.cos(sign.dir),sz=-Math.sin(sign.dir);
 g.draw('box',[sign.x,fy+.035,sign.z],[.12,.04,1.0],sign.color,sign.dir);
 for(const side of [-1,1])g.draw('box',[sign.x+dx*.37+sx*side*.14,fy+.04,sign.z+dz*.37+sz*side*.14],[.11,.04,.55],sign.color,sign.dir+side*.65);
 g.draw('box',[sign.x,fy+2.85,sign.z],[.95,.28,.16],sign.color,sign.dir);
}
function drawAltar(g,s,o,fy){
 const state=altarState(s,o),color=altarColor(o,state),exit=o.type==='exit',radius=exit?1.9:1.6;
 for(let i=0;i<32;i++){const a=i*Math.PI/16,x=o.x+Math.cos(a)*radius,z=o.z+Math.sin(a)*radius;if(isWalkable(o.floor,x,z,.05))g.draw('box',[x,fy+.045,z],[.19,.05,.19],color,a)}
 const alpha=state.status==='closed'?.12:.2+.07*Math.sin(s.t*3);
 g.draw('box',[o.x,fy+1.55,o.z],[.15,3.05,.15],color,0,alpha);
 if(exit){for(const side of [-1,1])g.draw('box',[o.x+side*1.7,fy+1.6,o.z],[.24,3.2,.32],color);g.draw('box',[o.x,fy+3.15,o.z],[3.7,.25,.35],color);g.draw('oct',[o.x,fy+2.7,o.z],[.65,.65,.65],color,s.t*.4)}
 else{g.draw('box',[o.x+1.3,fy+.9,o.z],[.4,1.8,.5],color);g.draw('oct',[o.x,fy+2.65,o.z],[.5,.65,.5],color,0,.85);g.draw('box',[o.x,fy+3.02,o.z],[1.4,.18,.22],color);}
}
function updateNavigationHUD(){
 const s=game,host=$('navigationHUD');if(!s)return;
 if(s.transit){host.innerHTML='<div class="nav-caption">正在通过实体楼梯 · 抵达后更新方向</div>';return}
 const target=s.navigation?.extraction,deadline=target&&s.schedule.exits.find(e=>e.objectId===target.targetId)?.closeAt;
 const noLongerSafe=Number.isFinite(deadline)&&Number.isFinite(target?.eta)&&deadline-s.t<=target.eta;
 const changed=!s.navigation||s.navigationFloor!==s.floor||noLongerSafe||Math.abs(s.t-(s.navigationTime??-1))>.25||distance(s.player,s.navigationPosition||{x:999,z:999})>1;
 if(changed){s.navigation=buildNavigation(s,LEVELS,STAIR_LINKS,pathTo,{lineClear:(f,a,b)=>isLineClear(f,a,b,.35)});s.navigationFloor=s.floor;s.navigationTime=s.t;s.navigationPosition={x:s.player.x,z:s.player.z}}
 const nav=s.navigation,rows=[];
 const row=(item,title)=>{if(!item)return;let stage=item.stage,caption=item.areaLabel,waypoint=item.waypoint,statusItem=item;
  if(item.floor!==s.floor){const leg=nav.stairs.find(x=>x.targetId===item.currentWaypointId);stage=leg?.stage||'unknown';caption=`前往 ${item.floor}L · ${leg?.areaLabel||'先沿上行标识前进'}`;statusItem=leg||item;}
  const arrow=stage!=='unknown'&&waypoint?`<span class="nav-arrow" style="transform:rotate(${Math.round(bearingDegrees(s.player,s.camera.yaw,waypoint)/5)*5}deg)">↑</span>`:'<span class="nav-region">◇</span>';
  const distanceText=stage==='unknown'?'区域线索':item.floor===s.floor?`约 ${Math.ceil(item.distance)}m`:`先到交通节点`;
  const status=(`${item.floor!==s.floor?'楼梯':''}`)+({unactivated:'待试炼',trial:'试炼进行中',ready:'已激活',closed:'已关闭'}[statusItem.status]||'');
  rows.push(`<div class="nav-row ${item.warning?'warning':''}" data-target="${item.targetId}" data-stage="${stage}">${arrow}<div><b>${title} · ${distanceText}</b><small>${caption} · ${status}</small></div></div>`);
 };
 const up=nav.stairs.find(x=>x.type==='stairsUp'),down=nav.stairs.find(x=>x.type==='stairsDown');row(up||down,up?'上行祭坛':'下行楼梯');
 row(nav.extraction,nav.nearestExitFloor?`${nav.nearestExitFloor}L 可撤离`:'撤离指引');
 const html=rows.join('')+`<div class="nav-caption">${nav.message}</div>`;if(host.innerHTML!==html)host.innerHTML=html;
}

function dimColor(color,factor){const n=parseInt(color.slice(1),16);return '#'+[n>>16&255,n>>8&255,n&255].map(c=>Math.round(c*factor).toString(16).padStart(2,'0')).join('')}
const wallPieces=LEVELS.map(l=>l.walls.flatMap(w=>{const out=[],nx=Math.ceil(w.w/3),nz=Math.ceil(w.d/3);for(let x=0;x<nx;x++)for(let z=0;z<nz;z++)out.push({...w,x:w.x-w.w/2+(x+.5)*w.w/nx,z:w.z-w.d/2+(z+.5)*w.d/nz,w:w.w/nx,d:w.d/nz});return out}));
const roofPieces=LEVELS.map(l=>l.ceilings.flatMap(r=>{const out=[],nx=Math.ceil(r.w/3),nz=Math.ceil(r.d/3);for(let x=0;x<nx;x++)for(let z=0;z<nz;z++)out.push({...r,x:r.x-r.w/2+(x+.5)*r.w/nx,z:r.z-r.d/2+(z+.5)*r.d/nz,w:r.w/nx,d:r.d/nz});return out}));
const sceneLandmarks=LEVELS.map(buildLandmarks);
const landmarkAnchors=LEVELS.map(l=>{const target=l.stairUp||l.spawn,c=[...l.covers].sort((a,b)=>distance(a,target)-distance(b,target))[0];if(!c)return null;const cells=Array.from(l.grid,(_,i)=>({x:l.minX+(i%l.width+.5)*l.cellSize,z:l.minZ+(Math.floor(i/l.width)+.5)*l.cellSize}));return cells.filter(p=>isWalkable(l.floor,p.x,p.z,.3)&&distance(p,c)<=4).sort((a,b)=>distance(a,c)-distance(b,c))[0]||null});
function drawScene(g,s){
 const l=LEVELS[s.floor-1],theme=FLOOR_THEMES[s.floor-1],fy=l.baseY,t=s.t,playerY=s.player.y??fy;
 g.frame([s.player.x,playerY,s.player.z],s.floor-1,{mode:'follow',...s.camera,blocked:cameraBlocked});
 for(const r of l.rects)if(inView(r,35))g.draw('box',[r.x,fy-SLAB_THICKNESS/2,r.z],[r.w,SLAB_THICKNESS,r.d],theme.floorColor);
 for(const wall of l.walls){if(!inView(wall,32))continue;
  g.draw('box',[wall.x,fy+wall.h/2,wall.z],[wall.w,wall.h,wall.d],theme.wall);
  g.draw('box',[wall.x,fy+.2,wall.z],[wall.w+.03,.15,wall.d+.03],theme.accent);
 }
 let opaque=0,cutaway=0;const room=l.rooms.find(r=>Math.abs(s.player.x-r.x)<r.w/2&&Math.abs(s.player.z-r.z)<r.d/2);
 for(const roof of roofPieces[s.floor-1]){if(!inView(roof,32))continue;
  const near=Math.max(0,Math.abs(s.player.x-roof.x)-roof.w/2)**2+Math.max(0,Math.abs(s.player.z-roof.z)-roof.d/2)**2<16;
  const sameRoom=room&&Math.abs(roof.x-room.x)<(roof.w+room.w)/2&&Math.abs(roof.z-room.z)<(roof.d+room.d)/2;
  const alpha=(near||sameRoom)?.12:1;if(alpha<1)cutaway++;else opaque++;
  g.draw('box',[roof.x,fy+WALL_HEIGHT+SLAB_THICKNESS/2,roof.z],[roof.w,SLAB_THICKNESS,roof.d],theme.ceiling,0,alpha);
 }
 g.ceilingStats={opaque,cutaway,total:l.ceilings.length};
 for(const c of l.covers){if(!inView(c,28))continue;g.draw('box',[c.x,fy+c.h/2,c.z],[c.w,c.h,c.d],theme.cover);g.draw('box',[c.x,fy+c.h+.02,c.z],[c.w,.07,c.d],theme.accent)}
 for(const d of l.detailBoxes||[])if(inView(d,24))g.draw('box',[d.x,fy+d.y+d.h/2,d.z],[d.w,d.h,d.d],d.kind==='pipe'?theme.pipe:d.color);
 for(const d of sceneLandmarks[s.floor-1])if(inView(d,28))g.draw(d.shape,[d.x,fy+d.y+d.h/2,d.z],[d.w,d.h,d.d],d.color,d.rotation||0,d.alpha??1);
 for(const room of l.rooms)if(inView(room,26))g.draw('box',[room.x,fy+.02,room.z],[1,.035,.25],room.kind==='hidden'?'#b79be1':theme.accent);
 for(const sign of s.routeSigns||[])if(sign.floor===s.floor&&inView(sign,24)&&(sign.type!=='exit'||s.navigation?.extraction?.targetId===sign.targetId))drawRouteSign(g,sign,fy);
 for(const link of STAIR_LINKS){if(link.fromFloor!==s.floor&&link.toFloor!==s.floor&&s.transit?.link.id!==link.id)continue;
  for(const box of [...link.steps,...link.landings])if(inView(box,32))g.draw('box',[box.x,box.y,box.z],[box.w,box.h,box.d],'#8a9eaf');
 }
 for(const o of s.objs){if(o.floor!==s.floor||o.done||!inView(o,28))continue;
  if(o.type==='recruit'){drawPerson(g,o,fy,o.role,false,t);g.draw('oct',[o.x,fy+2.2+Math.sin(t*2)*.1,o.z],[.45,.6,.45],ROLES[o.role].color)}
  else if(o.type==='exit'||o.type.startsWith('stairs'))drawAltar(g,s,o,fy);
  else{const key=o.type==='key',color=key?'#ecc876':o.chestTier==='elite'?'#C084FC':o.chestTier==='advanced'?'#FB923C':o.isDrop?'#98c8aa':'#7e9fa2';g.draw('box',[o.x,fy+.45,o.z],[key?1:1.3,.8,.85],color);g.draw('box',[o.x,fy+.9,o.z],[key?1.05:1.35,.13,.92],key?'#fae9a8':o.rare?'#ffe19c':'#b4c8bd');if(key)g.draw('oct',[o.x,fy+1.4,o.z],[.6,.6,.6],ITEMS[o.item].color);if(o.chestTier==='advanced')g.draw('box',[o.x,fy+.5,o.z+.44],[.3,.55,.03],'#FB923C');if(o.chestTier==='elite'){g.draw('oct',[o.x,fy+1.25,o.z],[.45,.45,.45],'#C084FC');g.draw('box',[o.x,fy+.5,o.z+.44],[.8,.3,.03],'#EF4444')}}
 }
 for(const trial of Object.values(s.trials))if(trial.floor===s.floor&&trial.status!=='idle'&&inView(trial,30))drawTrialCircle(g,trial,fy);
 for(const orb of s.drops)if(inView(orb,27))g.draw('oct',[orb.x,fy+.3+Math.sin(t*6)*.06,orb.z],[.25,.3,.25],'#74caff');
 for(const enemy of s.enemies)if(inView(enemy,30))drawPerson(g,enemy,fy,'enemy',true,t);
 for(const ally of s.allies)drawPerson(g,ally,fy,ally.role,false,t);
 if(g.cameraDistance>1.05)drawPerson(g,s.player,fy,s.player.role,false,t);
 for(const bullet of s.bullets)if(inView(bullet,30))g.draw('oct',[bullet.x,(bullet.y??fy)+1.05,bullet.z],[.3,.3,.3],bullet.color||'#f5b573');
 for(const fx of s.effects){
  if(fx.type==='line'){const a=fx.from,b=fx.to;g.draw('box',[(a.x+b.x)/2,(a.y??fy)+1.1,(a.z+b.z)/2],[.09,.09,distance(a,b)],fx.color,Math.atan2(b.x-a.x,b.z-a.z),Math.min(1,fx.life/(fx.maxLife||.15)))}
  else if((fx.type==='pulse'||fx.type==='telegraph')&&inView(fx,30)){const progress=1-fx.life/(fx.maxLife||1),radius=fx.radius*(fx.type==='telegraph'?1:Math.max(.05,progress));g.draw('cyl',[fx.x,fy+.06,fx.z],[radius*2,.06,radius*2],fx.color,0,fx.type==='telegraph'?.5:.22*(1-progress))}
  else if(fx.type==='backstab'&&inView(fx,30))g.draw('oct',[fx.x,fy+1.6,fx.z],[.35,.65,.35],'#ffdd76');
 }
 renderLabels(g,s,fy);
}
function exitCaption(s,o){const state=altarState(s,o);if(state.status==='closed')return '出口已关闭 · 试炼失效';if(state.status!=='ready'&&state.remaining!==null&&state.remaining<=state.trialRemaining+5)return '时间不足 · 请寻找更高层出口';if(state.status==='ready')return '已激活 · 再按E撤离';if(state.status==='trial')return '撤离试炼进行中';return 'E 立即召唤撤离试炼'}
function renderLabels(g,s,fy){
 const labels=[];
 for(const o of s.objs){if(o.floor!==s.floor||o.done||distance(o,s.player)>18||!isLineClear(s.floor,s.player,o,.05))continue;const p=g.point([o.x,fy+(o.type==='recruit'?2.4:1.9),o.z]);if(p[0]<40||p[0]>innerWidth-40||p[1]<140||p[1]>innerHeight-60)continue;
  const type=o.type==='exit'?activeExit(s.floor)?'exit':'closed':o.type==='recruit'?'recruit':o.type.startsWith('stairs')?'stair':'crate';
  const text=o.type==='recruit'?`✚ ${ROLES[o.role].name} +${ROLES[o.role].hpContribution}HP`:o.type==='exit'?exitCaption(s,o):o.type==='stairsUp'?s.unlocked[o.gate]?'↟ 通过 · 实体楼梯':'◎ 上行召唤试炼':o.type==='stairsDown'?'↡ 返回下层':o.type==='key'?`资源 ${o.item.toUpperCase()}`:o.isDrop?'掉落物资':CHEST_TABLES[o.chestTier]?.name||'搜索箱';
  labels.push(`<div class="marker ${type}" data-object="${o.id}" style="left:${p[0]}px;top:${p[1]}px">${text}</div>`);
 }
 for(const e of s.enemies){if(distance(e,s.player)>18||!isLineClear(s.floor,s.player,e,.05))continue;const p=g.point([e.x,fy+2.2*(ENEMIES[e.kind].scale||1),e.z]),text={idle:'○ 待机',alert:'! 发现',chase:'! 追击',search:'? 搜索'}[e.awareness]||'○';
  if(p[0]>40&&p[0]<innerWidth-40&&p[1]>120&&p[1]<innerHeight-60)labels.push(`<div class="enemy-state ${e.awareness}" style="left:${p[0]}px;top:${p[1]}px">${text}</div>`);
 }
 for(const fx of s.effects)if((fx.type==='backstab'||fx.type==='damage')&&distance(fx,s.player)<18&&isLineClear(s.floor,s.player,fx,.05)){const p=g.point([fx.x,fy+2+(1-fx.life/.85),fx.z]);labels.push(`<div class="${fx.type==='backstab'?'damage-backstab':'damage-number'}" style="left:${p[0]}px;top:${p[1]}px">${fx.type==='backstab'?'背刺 ×1.5 · ':''}${Math.round(fx.amount)}</div>`)}
 for(const sign of s.routeSigns||[])if(sign.floor===s.floor&&distance(sign,s.player)<14&&isLineClear(s.floor,s.player,sign,.05)&&(sign.type!=='exit'||s.navigation?.extraction?.targetId===sign.targetId)){const p=g.point([sign.x,fy+2.8,sign.z]);if(p[0]>50&&p[0]<innerWidth-50&&p[1]>100&&p[1]<innerHeight-90)labels.push(`<div class="route-sign-label" style="left:${p[0]}px;top:${p[1]}px;color:${sign.color}">${sign.type==='exit'?'⇥ 撤离设施':'↟ 上行祭坛'}</div>`)}
 UI.labels.innerHTML=labels.join('');
}
function drawMinimap(){
 if(!game)return;const s=game,l=LEVELS[s.floor-1],canvas=$('minimap'),ctx=canvas.getContext('2d');if(!ctx)return;
 const w=canvas.width,h=canvas.height,sx=w/(l.width*l.cellSize),sz=h/(l.height*l.cellSize),px=x=>(x-l.minX)*sx,pz=z=>(z-l.minZ)*sz;
 ctx.fillStyle='#030910';ctx.fillRect(0,0,w,h);
 for(const r of fogRuns(s.fog,s.floor)){ctx.fillStyle=r.state===2?'#456578':'#1d2c3b';ctx.fillRect(px(r.x-r.w/2),pz(r.z-r.d/2),r.w*sx,r.d*sz)}
 const cellX=Math.floor((s.player.x-l.minX)/l.cellSize),cellZ=Math.floor((s.player.z-l.minZ)/l.cellSize);s.visited.add(`${s.floor}:${cellX}:${cellZ}`);
 for(const o of s.objs){if(o.floor!==s.floor||o.done||(!o.discovered&&!o.initial))continue;
  if(o.initial&&!o.discovered){const x=px(o.x),z=pz(o.z);ctx.fillStyle='#72dbff';ctx.fillRect(x-1,z-5,2,10);ctx.fillRect(x-5,z-1,10,2);continue}
  const altar=o.type==='exit'||o.type.startsWith('stairs'),seen=visiblePoint(o),state=altar?altarState(s,o):null;
  if(altar){const unsafe=o.type==='exit'&&state.status!=='closed'&&s.navigation&&s.navigation.extraction?.targetId!==o.id,color=unsafe?'#efaa66':altarColor(o,state),x=px(o.x),z=pz(o.z),highlight=o.type==='exit'&&state.status!=='closed'&&!unsafe&&s.navigation?.extraction?.targetId===o.id;
   ctx.strokeStyle=color;ctx.lineWidth=highlight?2:1;ctx.beginPath();ctx.arc(x,z,highlight?5.5:4,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle=state.status==='closed'?'#e67676':state.status==='trial'?'#89cfff':state.status==='ready'?'#7dffc0':'#07131d';ctx.fillRect(x-2,z-2,4,4);
   if(state.status==='closed'){ctx.beginPath();ctx.moveTo(x-3,z-3);ctx.lineTo(x+3,z+3);ctx.moveTo(x+3,z-3);ctx.lineTo(x-3,z+3);ctx.stroke()}
   if(state.warning&&state.status!=='closed'){ctx.strokeStyle='#ffd16b';ctx.beginPath();ctx.arc(x,z,7+Math.sin(s.t*5),0,Math.PI*2);ctx.stroke()}
  }else{ctx.fillStyle=seen?(o.type==='recruit'?'#72dbff':o.type==='key'?'#ffe78c':o.rare?'#f0b556':'#739497'):'#53606a';const size=o.rare?4:2.5;ctx.fillRect(px(o.x)-size/2,pz(o.z)-size/2,size,size)}
 }
 const landmark=landmarkAnchors[s.floor-1];if(landmark&&s.landmarkMemory.has(s.floor)){ctx.fillStyle=visiblePoint(landmark)?FLOOR_THEMES[s.floor-1].accent:'#77878d';ctx.fillRect(px(landmark.x)-2,pz(landmark.z)-2,4,4)}
 for(const e of s.enemies){if(!visiblePoint(e))continue;ctx.fillStyle=ENEMIES[e.kind].color;ctx.fillRect(px(e.x)-1,pz(e.z)-1,2,2)}
 for(const a of s.allies){ctx.fillStyle=ROLES[a.role].color;ctx.fillRect(px(a.x)-1.5,pz(a.z)-1.5,3,3)}
 ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(px(s.player.x),pz(s.player.z),3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#81e9ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(s.player.x),pz(s.player.z));ctx.lineTo(px(s.player.x-Math.sin(s.camera.yaw)*6),pz(s.player.z-Math.cos(s.camera.yaw)*6));ctx.stroke();
}
let last=performance.now();
function frame(now){
 const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
 try{if(game){update(dt);drawScene(renderer,game);updateUI();mapClock+=dt;if(mapClock>.12){drawMinimap();mapClock=0}}else{renderer.frame([0,0,0],0);renderer.draw('box',[0,-1,0],[31,.8,24],'#203749');renderer.draw('box',[0,3,0],[10,6,10],'#314962');renderer.draw('box',[0,7,0],[9,.7,9],'#647e8e');renderer.draw('box',[0,11,0],[6,7,6],'#52677c');renderer.draw('oct',[0,15,0],[3,3,3],'#87b6c0')}}
 catch(error){console.error(error);if(game){game.status='paused';showModal(`<h2>运行异常</h2><p>${String(error.message||error)}</p><button class="btn" id="menuButton">返回主页</button>`);$('menuButton').onclick=lobby}}
 if(now>toastUntil)$('eventToast').classList.remove('show');requestAnimationFrame(frame);
}
try{renderer=new Renderer($('world'));lobby();requestAnimationFrame(frame)}catch(error){console.error(error);showModal(`<h2>无法启动 WebGL</h2><p>${String(error.message||error)}</p><p>请使用启用WebGL的新版Edge或Chrome。</p>`)}
