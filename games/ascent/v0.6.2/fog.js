// Per-run, per-floor knowledge. 0 unknown / 1 explored / 2 currently visible.
// World rendering, markers and minimap all consume this exact state.
export function createFog(levels){return{floors:new Map(levels.map(level=>[level.floor,{level,cells:new Uint8Array(level.width*level.height),runs:[]}]))}}
export function fogState(fog,floor,x,z){
 const f=fog?.floors.get(floor);if(!f||!Number.isFinite(x)||!Number.isFinite(z))return 0;
 const l=f.level,cx=Math.floor((x-l.minX)/l.cellSize),cz=Math.floor((z-l.minZ)/l.cellSize);
 return cx<0||cz<0||cx>=l.width||cz>=l.height?0:f.cells[cz*l.width+cx];
}
export function pointVisible(fog,floor,p,actors,lineClear=()=>true,options={}){
 const f=fog?.floors.get(floor);if(!f)return false;
 return actors.some(a=>(!Number.isFinite(a.y)||Math.abs(a.y-f.level.baseY)<=1.5)&&Math.hypot(a.x-p.x,a.z-p.z)<=(options.radius??(a.role==='sniper'?15:11))&&lineClear(a,p));
}
export function updateFog(fog,floor,actors,lineClear=()=>true,options={}){
 for(const f of fog.floors.values())for(let i=0;i<f.cells.length;i++)if(f.cells[i]===2)f.cells[i]=1;
 const f=fog.floors.get(floor);if(!f)return;const l=f.level;
 for(const a of actors){
  if(Number.isFinite(a.y)&&Math.abs(a.y-l.baseY)>1.5)continue;
  const radius=options.radius??(a.role==='sniper'?15:11),r2=radius*radius;
  const minX=Math.max(0,Math.floor((a.x-radius-l.minX)/l.cellSize)),maxX=Math.min(l.width-1,Math.floor((a.x+radius-l.minX)/l.cellSize));
  const minZ=Math.max(0,Math.floor((a.z-radius-l.minZ)/l.cellSize)),maxZ=Math.min(l.height-1,Math.floor((a.z+radius-l.minZ)/l.cellSize));
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
   const i=z*l.width+x;if(!l.grid[i]||f.cells[i]===2)continue;
   const p={x:l.minX+(x+.5)*l.cellSize,z:l.minZ+(z+.5)*l.cellSize};
   if((a.x-p.x)**2+(a.z-p.z)**2<=r2&&lineClear(a,p))f.cells[i]=2;
  }
 }
 // Exact interactable positions can lie on a cell edge. Check their actual LOS
 // rather than concealing a visible object because its cell centre is occluded.
 for(const p of options.points||[])if(pointVisible(fog,floor,p,actors,lineClear,options)){
  const x=Math.floor((p.x-l.minX)/l.cellSize),z=Math.floor((p.z-l.minZ)/l.cellSize);
  if(x>=0&&z>=0&&x<l.width&&z<l.height&&l.grid[z*l.width+x])f.cells[z*l.width+x]=2;
 }
 // Merge equal horizontal tiles so fog does not require a draw call per cell.
 for(const entry of fog.floors.values()){
  const {level:l,cells}=entry,runs=[];
  for(let z=0;z<l.height;z++)for(let x=0;x<l.width;){
   const state=cells[z*l.width+x];if(!state||!l.grid[z*l.width+x]){x++;continue}
   const start=x;while(x<l.width&&cells[z*l.width+x]===state&&l.grid[z*l.width+x])x++;
   runs.push({x:l.minX+(start+x)*l.cellSize/2,z:l.minZ+(z+.5)*l.cellSize,w:(x-start)*l.cellSize,d:l.cellSize,state});
  }entry.runs=runs;
 }
}
export function fogRuns(fog,floor){return fog?.floors.get(floor)?.runs||[]}
export function fogBoxState(fog,floor,box,margin=1.1){
 const f=fog?.floors.get(floor);if(!f)return 0;const l=f.level;
 const x0=Math.max(0,Math.floor((box.x-(box.w||.2)/2-margin-l.minX)/l.cellSize)),x1=Math.min(l.width-1,Math.floor((box.x+(box.w||.2)/2+margin-l.minX)/l.cellSize));
 const z0=Math.max(0,Math.floor((box.z-(box.d||.2)/2-margin-l.minZ)/l.cellSize)),z1=Math.min(l.height-1,Math.floor((box.z+(box.d||.2)/2+margin-l.minZ)/l.cellSize));
 let state=0;for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){state=Math.max(state,f.cells[z*l.width+x]);if(state===2)return 2}return state;
}
export function fogSummary(fog){return[...fog.floors.values()].map(({level,cells})=>({floor:level.floor,known:cells.reduce((n,c)=>n+(c>0),0),visible:cells.reduce((n,c)=>n+(c===2),0)}))}
