/** Pure per-run altar guidance. Coordinates remain internal model data: renderers
 * must show only areaLabel for unknown targets, then direction/distance while
 * approaching, and permanent exact map markers only for discovered objects.
 */
import {TRIAL_SETTINGS} from './trials.js?build=0.6.1';
import {BUDGET_SETTINGS, pathLength} from './timing.js?build=0.6.1';

const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const trialFor = (game,o) => game?.trials?.[o.id];
const zeroBudget = () => ({walkSeconds:0,stairSeconds:0,stairTrialSeconds:0,exitTrialSeconds:0,interactionSeconds:0});
const total = b => Object.values(b).reduce((n,v)=>n+v,0);

/** remaining is the global closing countdown (null means permanently open),
 * trialRemaining is seconds of unfinished circle progress. Never mutates trials.
 */
export function altarState(game,o) {
 const trial=trialFor(game,o),isExit=o.type==='exit',now=Number.isFinite(game?.t)?game.t:0;
 const deadline=isExit?game?.schedule?.exits?.find(e=>e.objectId===o.id&&e.floor===o.floor):null;
 const validDeadline=!isExit||!!deadline&&(deadline.closeAt===null||Number.isFinite(deadline.closeAt));
 const closeAt=isExit&&validDeadline?deadline.closeAt:null;
 const remaining=isExit&&closeAt!==null?Math.max(0,closeAt-now):null;
 const duration=Number.isFinite(trial?.duration)&&trial.duration>0?trial.duration:(isExit?TRIAL_SETTINGS.exitSeconds:TRIAL_SETTINGS.stairsSeconds);
 const unlocked=!isExit&&!!game?.unlocked?.[o.gate];
 // The shared gate flag is the traversal authority for both directions. A
 // stale completed trial alone must never invent an unlocked stair connection.
 const progress=!isExit&&!unlocked&&trial?.status==='completed'?0:Math.min(duration,Math.max(0,Number.isFinite(trial?.progress)?trial.progress:0));
 const complete=isExit?trial?.status==='completed':unlocked;
 const closed=isExit&&(!validDeadline||closeAt!==null&&now>=closeAt||trial?.status==='failed');
 const status=closed?'closed':complete?'ready':['running','paused'].includes(trial?.status)?'trial':'unactivated';
 const trialRemaining=complete?0:Math.max(0,duration-progress);
 const urgency=closed?'closed':remaining!==null&&remaining<=30?'critical':remaining!==null&&remaining<=90?'warning':'normal';
 return {status,remaining,closeAt,trialRemaining,progress,duration,paused:trial?.status==='paused',warning:urgency!=='normal',urgency,usable:status==='ready'};
}

/** Camera yaw zero looks north (-Z); CSS arrow zero points up. */
export function bearingDegrees(player,cameraYaw,p) {
 if(!point(player)||!point(p)||dist(player,p)<1e-8)return 0;
 const angle=Math.atan2(p.x-player.x,player.z-p.z)+(Number.isFinite(cameraYaw)?cameraYaw:0);
 return ((angle*180/Math.PI)%360+360)%360;
}

function regionFor(level,o) {
 const room=level?.rooms?.find(r=>point(r)&&Number.isFinite(r.w)&&Number.isFinite(r.d)&&Math.abs(o.x-r.x)<=r.w/2&&Math.abs(o.z-r.z)<=r.d/2);
 const names={laboratory:'实验区',storage:'储藏区',office:'办公区',maintenance:'维修区',hidden:'隐蔽档案区'};
 const cx=Number.isFinite(level?.minX)&&Number.isFinite(level?.width)&&Number.isFinite(level?.cellSize)?level.minX+level.width*level.cellSize/2:(level?.spawn?.x??0);
 const cz=Number.isFinite(level?.minZ)&&Number.isFinite(level?.height)&&Number.isFinite(level?.cellSize)?level.minZ+level.height*level.cellSize/2:(level?.spawn?.z??0);
 const dx=o.x-cx,dz=o.z-cz;
 const direction=Math.abs(dx)>Math.abs(dz)?dx>=0?'东侧':'西侧':dz>=0?'南侧':'北侧';
 return `${names[room?.kind]||'连廊区'} / ${direction}${room?'房区':'连廊'}`;
}

/** pathFn(floor,start,end) returns a complete safe planar polyline. No fallback
 * straight line is allowed for an absent, truncated, invalid or thrown route.
 * Options reuse timing budget settings plus approachingThreshold (40m), and an
 * optional lineClear(floor,a,b) for a safe route lookahead (lookaheadDistance=8).
 * ETA includes remaining trial progress, physical 3D stairs, 3s handoffs and a
 * separate final E buffer. It is a travel/trial lower bound, not a combat promise.
 */
export function buildNavigation(game,levels,links,pathFn,options={}) {
 const settings={...BUDGET_SETTINGS,approachingThreshold:40,lookaheadDistance:8,...options};
 const invalid={stairs:[],extraction:null,nearestExitFloor:null,message:'暂无可确认的安全撤离路线'};
 if(!game||!point(game.player)||!Array.isArray(levels)||!Array.isArray(links)||typeof pathFn!=='function')return invalid;
 if(!['walkingSpeed','stairSpeed'].every(k=>Number.isFinite(settings[k])&&settings[k]>0)||!['stairHandoffSeconds','completionBufferSeconds'].every(k=>Number.isFinite(settings[k])&&settings[k]>=0))return invalid;
 const objects=Array.isArray(game.objs)?game.objs:[],floors=new Map(levels.map(l=>[l.floor,l])),cache=new Map();
 const route=(floor,a,b)=>{
  if(!point(a)||!point(b))return null;
  const key=[floor,a.x,a.z,b.x,b.z].join(':');if(cache.has(key))return cache.get(key);
  let result=null;
  try{
   const path=pathFn(floor,a,b),length=pathLength(path);
   if(Array.isArray(path)&&path.length&&Number.isFinite(length)&&dist(path[0],a)<=.75&&dist(path.at(-1),b)<=.75){
    // Follow the first safe segment by default. A longer chord is only permitted
    // with the caller's actual collision/LOS test, never by Euclidean proximity.
    let waypoint=path.find(p=>dist(p,a)>.05)||path.at(-1);
    if(typeof settings.lineClear==='function'){
     if(!settings.lineClear(floor,a,waypoint))waypoint=null;
     let walked=0;
     for(let i=1;i<path.length;i++){
      walked+=dist(path[i-1],path[i]);if(walked>settings.lookaheadDistance)break;
      if(dist(path[i],a)>.05&&settings.lineClear(floor,a,path[i]))waypoint=path[i];
     }
    }
    if(waypoint)result={distance:length,waypoint:{x:waypoint.x,z:waypoint.z,floor}};
   }
  }catch{/* Missing paths are unavailable, never a direct-arrow shortcut. */}
  cache.set(key,result);return result;
 };
 const target=(o,distance,waypoint,extra={})=>{
  const state=altarState(game,o),areaLabel=regionFor(floors.get(o.floor),o);
  return {targetId:o.id,floor:o.floor,x:o.x,z:o.z,type:o.type,
   stage:o.discovered?'discovered':o.floor===game.floor&&distance<=settings.approachingThreshold?'approaching':'unknown',
   areaLabel,region:areaLabel,distance,waypoint,...state,...extra};
 };
 // Validate each real lower/upper landing against the complete physical flight.
 const flights=links.map(link=>{
  const up=objects.find(o=>o.type==='stairsUp'&&o.floor===link.fromFloor&&o.gate===link.id);
  const down=objects.find(o=>o.type==='stairsDown'&&o.floor===link.toFloor&&o.gate===link.id);
  const path=link.path,length=pathLength(path,true),low=floors.get(link.fromFloor),high=floors.get(link.toFloor);
  if(!up||!down||!low||!high||!Array.isArray(path)||path.length<2||!(length>0)||!Number.isFinite(length)||
   dist(path[0],up)>.75||dist(path.at(-1),down)>.75||!Number.isFinite(low.baseY)||!Number.isFinite(high.baseY)||
   Math.abs(path[0].y-low.baseY)>.75||Math.abs(path.at(-1).y-high.baseY)>.75||!(high.baseY>low.baseY))return null;
  return {link,up,down,distance:length,seconds:length/settings.stairSpeed+settings.stairHandoffSeconds};
 }).filter(Boolean);
 const stairs=objects.filter(o=>o.floor===game.floor&&['stairsUp','stairsDown'].includes(o.type)).map(o=>{
  const walk=route(o.floor,game.player,o),flight=flights.find(f=>f.link.id===o.gate);
  const locked=o.type==='stairsDown'&&!game.unlocked?.[o.gate],reachable=!!walk&&!!flight&&!locked;
  const budget=zeroBudget();budget.walkSeconds=walk?walk.distance/settings.walkingSpeed:Infinity;
  budget.stairSeconds=flight?.seconds??Infinity;
  budget.stairTrialSeconds=o.type==='stairsUp'?altarState(game,o).trialRemaining:0;
  const eta=reachable?total(budget):Infinity;
  return target(o,walk?.distance??Infinity,reachable?walk.waypoint:null,{reachable,status:locked?'locked':altarState(game,o).status,eta,ETA:eta,budget,currentWaypointId:o.id});
 });
 // Dijkstra states are actual arrival landings. Upward locked gates are legal
 // only after their outstanding circle time; locked downward travel is illegal.
 const start={key:'player',floor:game.floor,point:game.player,budget:zeroBudget(),distance:0,firstId:null,waypoint:null};
 const queue=[start],best=new Map([['player',0]]),arrivals=[];
 while(queue.length){
  queue.sort((a,b)=>total(a.budget)-total(b.budget));const current=queue.shift();
  if(total(current.budget)>best.get(current.key)+1e-9)continue;arrivals.push(current);
  for(const f of flights){
   let source,dest,trialSeconds=0;
   if(current.floor===f.link.fromFloor){source=f.up;dest=f.down;trialSeconds=altarState(game,source).trialRemaining;}
   else if(current.floor===f.link.toFloor&&game.unlocked?.[f.link.id]){source=f.down;dest=f.up;}
   else continue;
   const walk=route(current.floor,current.point,source);if(!walk)continue;
   const budget={...current.budget,walkSeconds:current.budget.walkSeconds+walk.distance/settings.walkingSpeed,
    stairSeconds:current.budget.stairSeconds+f.seconds,stairTrialSeconds:current.budget.stairTrialSeconds+trialSeconds};
   const cost=total(budget),key=dest.id;if(cost>=(best.get(key)??Infinity)-1e-9)continue;
   best.set(key,cost);queue.push({key,floor:dest.floor,point:dest,budget,distance:current.distance+walk.distance+f.distance,
    firstId:current.firstId||source.id,waypoint:current.waypoint||walk.waypoint});
  }
 }
 const candidates=[];
 for(const o of objects.filter(o=>o.type==='exit'&&point(o))){
  const state=altarState(game,o);if(state.status==='closed')continue;
  let chosen=null;
  for(const a of arrivals.filter(a=>a.floor===o.floor)){
   const walk=route(o.floor,a.point,o);if(!walk)continue;
   const budget={...a.budget,walkSeconds:a.budget.walkSeconds+walk.distance/settings.walkingSpeed,
    exitTrialSeconds:state.trialRemaining,interactionSeconds:settings.completionBufferSeconds};
   const eta=total(budget);if(state.remaining!==null&&eta>=state.remaining-1e-9)continue;
   if(chosen&&chosen.eta<=eta)continue;
   const item=target(o,a.distance+walk.distance,a.waypoint||walk.waypoint,{eta,ETA:eta,budget,reachable:true,
    currentWaypointId:a.firstId||o.id,slack:state.remaining===null?null:state.remaining-eta});
   chosen={...item,destination:{targetId:o.id,floor:o.floor,x:o.x,z:o.z,stage:item.stage,areaLabel:item.areaLabel}};
  }
  if(chosen)candidates.push(chosen);
 }
 // Current floor first; if it cannot complete before closing, guide upward to
 // the first safe floor. Returning downward remains supported when no higher
 // candidate exists, and only through genuinely unlocked bidirectional links.
 const rank=floor=>floor===game.floor?0:floor>game.floor?floor-game.floor:100+game.floor-floor;
 candidates.sort((a,b)=>rank(a.floor)-rank(b.floor)||a.eta-b.eta||String(a.targetId).localeCompare(String(b.targetId)));
 const extraction=candidates[0]||null;
 let message=extraction?`最近可撤离：${extraction.floor}L · 预计${Math.ceil(extraction.eta)}秒（含试炼与最终E）`:'暂无来得及完成的撤离路线，请检查上行通路';
 if(extraction?.floor>game.floor)message=`本层${objects.some(o=>o.floor===game.floor&&o.type==='exit')?'出口已关闭或剩余时间不足':'无撤离口'} · 先上楼前往${extraction.floor}L安全出口`;
 if(extraction?.floor<game.floor)message=`更高出口不可用 · 经已解锁楼梯返回${extraction.floor}L安全出口`;
 return {stairs,extraction,nearestExitFloor:extraction?.floor??null,message};
}
