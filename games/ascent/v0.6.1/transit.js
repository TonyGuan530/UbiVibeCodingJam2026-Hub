import {stairLength,stairPoint} from './world.js?build=0.6.1';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const routeLength=path=>path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
function along(path,d){for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],len=distance(a,b);if(d<=len){const r=len?d/len:1;return{x:a.x+(b.x-a.x)*r,y:a.y+(b.y-a.y)*r,z:a.z+(b.z-a.z)*r}}d-=len}return{...path.at(-1)}}
export function createTransit(link,fromFloor,actors,speed=3){
 if(![link.fromFloor,link.toFloor].includes(fromFloor)||!actors.length||!(speed>0))throw Error('Invalid stair traversal');
 const reverse=fromFloor===link.toFloor,start=stairPoint(link,reverse?1:0),length=stairLength(link);
 const travellers=actors.map((a,i)=>{const origin={x:a.x,y:Number.isFinite(a.y)?a.y:start.y,z:a.z};const path=a.approachPath?.length?a.approachPath:[origin,start];return{origin,path,approach:routeLength(path),delay:i*.35}});
 return{link,fromFloor,toFloor:reverse?link.fromFloor:link.toFloor,reverse,start,length,travellers,speed,elapsed:0,duration:Math.max(...travellers.map(t=>t.delay+(t.approach+length)/speed)),done:false};
}
export function tickTransit(transit,dt){
 transit.elapsed=Math.min(transit.duration,transit.elapsed+Math.max(0,Number.isFinite(dt)?dt:0));
 const poses=transit.travellers.map(t=>{
  const d=Math.max(0,(transit.elapsed-t.delay)*transit.speed);
  if(t.approach>.001&&d<t.approach)return along(t.path,d);
  const ratio=Math.max(0,Math.min(1,(d-t.approach)/transit.length));return stairPoint(transit.link,transit.reverse?1-ratio:ratio);
 });
 transit.done=transit.elapsed>=transit.duration;
 return{poses,done:transit.done,progress:transit.elapsed/transit.duration,elapsed:transit.elapsed};
}
