/** Fixed compact eight-floor ASCENT tower. Metres; grid is the X/Z collision plane.
 * Structural boxes use centre coordinates; baseY is the walking plane.
 * Architecture is deterministic. Only room occupants and exits consume randomness.
 */
const CELL=2, WIDTH=34, HEIGHT=34, MIN_X=-34, MIN_Z=-34;
export const FLOOR_HEIGHT=4.4, WALL_HEIGHT=3.5, SLAB_THICKNESS=.3;
const ROLES=['heavy','berserker','sniper','explosive','freeze','control','ricochet','electric'];
const FIELDS=['laboratory','storage','office','maintenance'];
const NAMES={laboratory:'实验室',storage:'储藏库',office:'办公室',maintenance:'维修间',hidden:'隐蔽档案室'};
const FLOOR_NAMES=['接驳后勤','样本储运','维护工坊','研发档案','生化实验','观测分析','安全控制','核心研究'];
const cellPoint=(x,z)=>({x:MIN_X+(x+.5)*CELL,z:MIN_Z+(z+.5)*CELL});
const shaftFor=f=>({...cellPoint(f%2?27:6,17+(f%3-1)*2),w:10,d:12,id:`gate${f}`});
const startFor=f=>{const s=shaftFor(f);return {x:s.x-2,z:s.z-4};};
const endFor=f=>{const s=shaftFor(f);return {x:s.x+2,z:s.z-4};};

// Merge horizontal runs vertically without bridging doorways or structural holes.
function rectangles(mask,value,type) {
  const finished=[],active=new Map();
  for(let z=0;z<HEIGHT;z++) {
    const next=new Map();
    for(let x=0;x<WIDTH;) {
      if(mask[z*WIDTH+x]!==value){x++;continue;}
      const start=x;while(x<WIDTH&&mask[z*WIDTH+x]===value)x++;
      const key=`${start}:${x}`,old=active.get(key);
      if(old){old.rows++;next.set(key,old);active.delete(key);}else next.set(key,{start,z,columns:x-start,rows:1});
    }
    finished.push(...active.values());active.clear();for(const [key,r]of next)active.set(key,r);
  }
  finished.push(...active.values());
  return finished.map(r=>({x:MIN_X+(r.start+r.columns/2)*CELL,z:MIN_Z+(r.z+r.rows/2)*CELL,w:r.columns*CELL,d:r.rows*CELL,type}));
}

function buildFloor(floor) {
  const grid=new Uint8Array(WIDTH*HEIGHT),rooms=[],covers=[],doorways=[],baseY=(floor-1)*FLOOR_HEIGHT;
  const fill=(x0,z0,x1,z1,value=0)=>{for(let z=Math.max(1,z0);z<=Math.min(HEIGHT-2,z1);z++)for(let x=Math.max(1,x0);x<=Math.min(WIDTH-2,x1);x++)grid[z*WIDTH+x]=value;};
  fill(1,1,WIDTH-2,HEIGHT-2,1);
  const addRoom=(x0,z0,x1,z1,kind,depth)=>{
    const r={id:`f${floor}-r${rooms.length+1}`,name:`${NAMES[kind]} ${rooms.length+1}`,x:MIN_X+(x0+x1+1)*CELL/2,z:MIN_Z+(z0+z1+1)*CELL/2,w:(x1-x0+1)*CELL,d:(z1-z0+1)*CELL,kind,depth};
    rooms.push(r);return r;
  };
  const xs=[[3,11],[14,22],[25,31]],zs=[[3,10],[13,21],[24,31]];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++) {
    // Each floor offsets selected room blocks, partitions and doors independently.
    const xshift=(floor+row+col)%3===0?1:0,zshift=(floor+2*col+row)%3===0?-1:0;
    let [x0,x1]=xs[col],[z0,z1]=zs[row];x0+=xshift;z0+=zshift;z1+=zshift;
    const mid=Math.floor((x0+x1)/2),split=row<2&&col<3,zm=Math.floor((z0+z1)/2);
    fill(x0,z0,x1,z0);fill(x0,z1,x1,z1);fill(x0,z0,x0,z1);fill(x1,z0,x1,z1);fill(mid,z0,mid,z1);
    const door=z0+1+(floor+row)%2;
    fill(x0,door,x0,door+1,1);fill(x1,z0+2,x1,z0+3,1);
    doorways.push({...cellPoint(x0,door),z:cellPoint(x0,door).z+1,axis:'z',openingWidth:4},
      {...cellPoint(x1,z0+2),z:cellPoint(x1,z0+2).z+1,axis:'z',openingWidth:4});
    const kind=FIELDS[(floor+row+col)%4];
    if(split) {
      fill(x0+1,zm,mid-1,zm);fill(x0+1,zm,x0+1,zm,1);
      doorways.push({...cellPoint(x0+1,zm),axis:'x',openingWidth:2,hidden:true});
      addRoom(x0+1,z0+1,mid-1,zm-1,kind,1);
      addRoom(x0+1,zm+1,mid-1,z1-1,'hidden',2);
    } else addRoom(x0+1,z0+1,mid-1,z1-1,kind,1);
    const right=addRoom(mid+1,z0+1,x1-1,z1-1,FIELDS[(floor+row+col+1)%4],1);
    if(!split&&(row+col+floor)%2===0)fill(mid,z0+2,mid,z0+3,1);
    const p=cellPoint(x1-1,z1-1);covers.push({...p,w:2,d:2,h:(row+col)%3?1.1:1.8});right.cover=p;
  }
  // Unequal maintenance alcoves break the silhouette and keep separate hall loops.
  fill(1,1,2+(floor%2),2,0);
  fill(WIDTH-3,HEIGHT-3-(floor%3),WIDTH-2,HEIGHT-2,0);
  const stairwells=[floor>1?shaftFor(floor-1):null,floor<8?shaftFor(floor):null].filter(Boolean);
  const inShaft=(x,z,margin=0)=>stairwells.some(s=>Math.abs(x-s.x)<s.w/2+margin&&Math.abs(z-s.z)<s.d/2+margin);
  for(const s of stairwells) {
    // Clear the entire physical flight on both floors, including wall-size cells.
    fill(Math.floor((s.x-s.w/2-MIN_X)/CELL),Math.floor((s.z-s.d/2-MIN_Z)/CELL),Math.ceil((s.x+s.w/2-MIN_X)/CELL)-1,Math.ceil((s.z+s.d/2-MIN_Z)/CELL)-1,1);
    // Both altar approaches share a broad front apron. The shaft stays open,
    // but actors can dodge sideways/forward and leave the trial circle safely.
    fill(Math.floor((s.x-7-MIN_X)/CELL),Math.floor((s.z-9-MIN_Z)/CELL),Math.ceil((s.x+7-MIN_X)/CELL)-1,Math.ceil((s.z-3-MIN_Z)/CELL)-1,1);
  }
  const clearCovers=covers.filter(c=>!inShaft(c.x,c.z,1));
  const walls=rectangles(grid,0,'wall').map(r=>({...r,h:WALL_HEIGHT}));
  const floorMask=grid.slice(),ceilingMask=grid.slice(),voidMask=new Uint8Array(grid.length);
  // A shared open shaft must pierce the upper slab and both ceiling skins.
  for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++) {
    const p=cellPoint(x,z);
    if(inShaft(p.x,p.z,1e-8)){
      ceilingMask[z*WIDTH+x]=0;
      // The front landing is solid. Deeper shaft cells have no planar floor:
      // only the explicit 3D stair transit may pass through those positions.
      if(stairwells.some(s=>Math.abs(p.x-s.x)<s.w/2&&p.z>s.z-3&&p.z<s.z+s.d/2)){
        grid[z*WIDTH+x]=0;floorMask[z*WIDTH+x]=0;voidMask[z*WIDTH+x]=1;
      }
    }
  }
  const rects=rectangles(floorMask,1,'floor').map(r=>({...r,h:SLAB_THICKNESS}));
  const ceilings=rectangles(ceilingMask,1,'ceiling').map(r=>({...r,h:SLAB_THICKNESS}));
  for(const c of clearCovers)grid[Math.floor((c.z-MIN_Z)/CELL)*WIDTH+Math.floor((c.x-MIN_X)/CELL)]=0;
  const stairUp=floor<8?startFor(floor):null,stairDown=floor>1?endFor(floor-1):null;
  const spawn=stairDown?{...stairDown}:cellPoint(12,25);
  // Room centres consumed by a stairwell are no longer rooms or spawn candidates.
  const actualRooms=rooms.filter(r=>!inShaft(r.x,r.z,2)&&grid[Math.floor((r.z-MIN_Z)/CELL)*WIDTH+Math.floor((r.x-MIN_X)/CELL)]);
  return {floor,name:`${FLOOR_NAMES[floor-1]}层`,baseY,slabThickness:SLAB_THICKNESS,minX:MIN_X,minZ:MIN_Z,width:WIDTH,height:HEIGHT,cellSize:CELL,grid,voidMask,rects,walls,covers:clearCovers,rooms:actualRooms,floorArea:grid.reduce((n,v)=>n+v,0)*4,spawn,stairUp,stairDown,exit:null,exits:[],ceilings,stairwells,doorways,detailBoxes:[]};
}
export const LEVELS=Array.from({length:8},(_,i)=>buildFloor(i+1));

export const STAIR_LINKS=Array.from({length:7},(_,i)=>{
  const fromFloor=i+1,toFloor=i+2,shaft=shaftFor(fromFloor),low=LEVELS[i].baseY,high=LEVELS[i+1].baseY,mid=(low+high)/2;
  const path=[{...startFor(fromFloor),y:low},{x:shaft.x-2,z:shaft.z+3,y:mid},{x:shaft.x+2,z:shaft.z+3,y:mid},{...endFor(fromFloor),y:high}];
  const steps=[];
  for(const [a,b]of [[path[0],path[1]],[path[2],path[3]]])for(let n=1;n<=11;n++) {
    const t=(n-.5)/11;steps.push({x:a.x,y:a.y+(b.y-a.y)*n/11-.1,z:a.z+(b.z-a.z)*t,w:2.4,d:7/11,h:.2});
  }
  const landings=[{x:shaft.x,z:path[0].z,y:low-.15,w:10,d:2,h:.3},{x:shaft.x,z:shaft.z+3,y:mid-.15,w:6.4,d:2,h:.3},{x:shaft.x,z:path[3].z,y:high-.15,w:10,d:2,h:.3}];
  return {id:`gate${fromFloor}`,fromFloor,toFloor,path,steps,landings,shaft};
});
/** Total 3D centreline metres; accepts one STAIR_LINKS entry. */
export function stairLength(link) {return link.path.slice(1).reduce((n,p,i)=>{const a=link.path[i];return n+Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z);},0);}
/** Arc-length fraction [0,1], clamped; pass 1-ratio for descending. */
export function stairPoint(link,ratio) {
  const t=Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:0));
  if(t===0)return {...link.path[0]};if(t===1)return {...link.path.at(-1)};
  let remaining=stairLength(link)*t;
  for(let i=1;i<link.path.length;i++) {
    const a=link.path[i-1],b=link.path[i],d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    if(remaining<=d){const v=remaining/d;return {x:a.x+(b.x-a.x)*v,y:a.y+(b.y-a.y)*v,z:a.z+(b.z-a.z)*v};}remaining-=d;
  }
  return {...link.path.at(-1)};
}
/** Circle versus grid solids, including covers and the exterior boundary. */
export function isWalkable(f,x,z,radius=.3) {
  const l=LEVELS[f-1];
  if(!l||!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<0)return false;
  if(x-radius<=l.minX||z-radius<=l.minZ||x+radius>=l.minX+l.width*CELL||z+radius>=l.minZ+l.height*CELL)return false;
  const ax=Math.floor((x-radius-l.minX)/CELL),bx=Math.floor((x+radius-l.minX)/CELL),az=Math.floor((z-radius-l.minZ)/CELL),bz=Math.floor((z+radius-l.minZ)/CELL);
  for(let iz=az;iz<=bz;iz++)for(let ix=ax;ix<=bx;ix++) {
    if(l.grid[iz*WIDTH+ix])continue;
    const left=l.minX+ix*CELL,top=l.minZ+iz*CELL;
    const dx=Math.max(left-x,0,x-left-CELL),dz=Math.max(top-z,0,z-top-CELL);
    if(dx*dx+dz*dz<=radius*radius+1e-10)return false;
  }
  return true;
}

/** Fine sampling prevents projectiles and camera rays crossing even a wall corner. */
export function isLineClear(f,a,b,radius=.1) {
  if(!a||!b)return false;
  const distance=Math.hypot(b.x-a.x,b.z-a.z);
  if(!Number.isFinite(distance))return false;
  const steps=Math.max(1,Math.ceil(distance/.2));
  for(let i=0;i<=steps;i++) {
    const t=i/steps;
    if(!isWalkable(f,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,radius))return false;
  }
  return true;
}

/** Render-only native boxes. y is the box bottom relative to the floor plane;
 * draw at baseY+y+h/2. Low trim remains inside existing solids, while door
 * headers and pipes sit above 2.6m. Never add these to navigation/camera solids.
 */
function architecturalDetails(l) {
  const boxes=[],overlap=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2-1e-8&&Math.abs(a.z-b.z)<(a.d+b.d)/2-1e-8;
  const tiles=[];
  for(let i=0;i<l.grid.length;i++)if(l.grid[i])tiles.push({...cellPoint(i%WIDTH,Math.floor(i/WIDTH)),w:2,d:2});
  const add=b=>{
    if(l.stairwells.some(s=>overlap(b,s)))return;
    if(b.y<2.2&&tiles.some(t=>overlap(b,t)))return;
    boxes.push(b);
  };
  for(const door of l.doorways) {
    const {x,z,axis,openingWidth,hidden}=door,alongZ=axis==='z',normal=alongZ?{x:1.4,z:0}:{x:0,z:1.4};
    if(!isLineClear(l.floor,{x:x-normal.x,z:z-normal.z},{x:x+normal.x,z:z+normal.z},.65))continue;
    const color=hidden?'#a28354':'#839aa2',span=openingWidth+.48;
    add({x,z,w:alongZ?.34:span,d:alongZ?span:.34,y:2.7,h:.24,color,kind:'doorLintel',axis,openingWidth});
    for(const sign of [-1,1])add({x:x+(alongZ?0:sign*(openingWidth/2+.12)),z:z+(alongZ?sign*(openingWidth/2+.12):0),w:alongZ?.34:.24,d:alongZ?.24:.34,y:0,h:2.94,color,kind:'doorPost'});
    if(hidden)add({x,z,w:alongZ?.4:.65,d:alongZ?.65:.4,y:3.02,h:.13,color:'#d1a35c',kind:'hiddenMarker'});
  }
  // Exposed service trunks follow the top of existing walls rather than cutting
  // across rooms, roof openings or the camera's human-height collision plane.
  let pipes=0;
  for(const wall of l.walls.filter(w=>Math.max(w.w,w.d)>=8)) {
    const alongX=wall.w>=wall.d;
    for(const sign of [-1,1]) {
      const x=wall.x+(alongX?0:sign*(wall.w/2+.11)),z=wall.z+(alongX?sign*(wall.d/2+.11):0);
      if(!isWalkable(l.floor,x,z,.01))continue;
      const before=boxes.length;
      add({x,z,w:alongX?wall.w-.4:.2,d:alongX?.2:wall.d-.4,y:3.08,h:.16,color:l.floor>=6?'#ad8975':'#6fa0a4',kind:'pipe'});
      if(boxes.length>before){pipes++;break;}
    }
    if(pipes===24)break;
  }
  return boxes;
}
for(const l of LEVELS)l.detailBoxes=architecturalDetails(l);

function cellIndex(l,p){return Math.floor((p.z-l.minZ)/CELL)*WIDTH+Math.floor((p.x-l.minX)/CELL);}
function floodPaths(l,start) {
  const previous=new Int32Array(l.grid.length).fill(-1),queue=new Int32Array(l.grid.length);
  let head=0,tail=0;previous[start]=start;queue[tail++]=start;
  while(head<tail) {
    const i=queue[head++],x=i%WIDTH,z=Math.floor(i/WIDTH);
    for(const j of [x>0?i-1:-1,x<WIDTH-1?i+1:-1,z>0?i-WIDTH:-1,z<HEIGHT-1?i+WIDTH:-1]) {
      if(j<0||!l.grid[j]||previous[j]!==-1)continue;
      previous[j]=i;queue[tail++]=j;
    }
  }
  return previous;
}

// Cache the most recent destination per floor: enemy groups share the player target.
const pathCache=new Map();
export function pathTo(f,a,b) {
  const l=LEVELS[f-1];
  if(!l||!a||!b||!isWalkable(f,a.x,a.z)||!isWalkable(f,b.x,b.z))return [];
  const start=cellIndex(l,a),end=cellIndex(l,b);
  let cached=pathCache.get(f);
  if(!cached||cached.end!==end){cached={end,previous:floodPaths(l,end)};pathCache.set(f,cached);}
  if(cached.previous[start]===-1)return [];
  const route=[];let i=start;
  while(i!==end){route.push(cellPoint(i%WIDTH,Math.floor(i/WIDTH)));i=cached.previous[i];}
  route.push(cellPoint(end%WIDTH,Math.floor(end/WIDTH)));
  if(Math.hypot(a.x-route[0].x,a.z-route[0].z)>.001)route.unshift({x:a.x,z:a.z});
  if(Math.hypot(b.x-route.at(-1).x,b.z-route.at(-1).z)>.001)route.push({x:b.x,z:b.z});
  return route;
}

/** Bounded path lookahead for per-frame pursuit: never chase a previous cell centre. */
export function navigationTarget(f,from,to) {
  const route=pathTo(f,from,to);
  for(let i=Math.min(route.length,12)-1;i>=0;i--) {
    const p=route[i];
    if(Math.hypot(p.x-from.x,p.z-from.z)<.001)continue;
    if(isLineClear(f,from,p,.35))return {x:p.x,z:p.z};
  }
  return {x:from.x,z:from.z};
}


function shuffle(values,random) {
  const out=[...values];
  for(let i=out.length-1;i>0;i--){const j=Math.max(0,Math.min(i,Math.floor(random()*(i+1))));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
const routeLength=route=>route.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-route[i].x,p.z-route[i].z),0);
const distance=(f,a,b)=>{const p=pathTo(f,a,b);return p.length?routeLength(p):Infinity;};
// A room label alone is insufficient for a 4.5m altar: reject narrow hidden
// cells and cabinet corners. Keep a connected planar patch for a full squad to
// dodge, with a short navigable route outside the ring and back through a door.
function trialSpace(f,p) {
  let free=0,visible=0;
  for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
    if(Math.hypot(dx,dz)>4.5||!isWalkable(f,p.x+dx,p.z+dz,.65))continue;
    free++;if(isLineClear(f,p,{x:p.x+dx,z:p.z+dz},.65))visible++;
  }
  if(free<36||visible<30)return false;
  for(let n=0;n<16;n++){
    const angle=n*Math.PI/8,q={x:p.x+6*Math.cos(angle),z:p.z+6*Math.sin(angle)};
    if(!isWalkable(f,q.x,q.z,.65))continue;
    const route=pathTo(f,p,q);
    if(route.length&&routeLength(route)<=14&&route.slice(1).every((v,i)=>isLineClear(f,route[i],v,.65)))return true;
  }
  return false;
}
// Pools are derived once from the fixed architecture. No random retry can hide an invalid tile.
const POOLS=LEVELS.map(l=>{
  const rooms=l.rooms.filter(r=>isWalkable(l.floor,r.x,r.z,.6)&&pathTo(l.floor,l.spawn,r).length).map(r=>({...r,routeDistance:distance(l.floor,l.spawn,r)}));
  if(l.floor>=4)l.exits=rooms.filter(r=>r.routeDistance>=30&&(!l.stairUp||distance(l.floor,l.stairUp,r)>=30)&&!isLineClear(l.floor,l.spawn,r,.35)&&trialSpace(l.floor,r)).map(r=>({...r}));
  const goals=l.stairUp?[l.stairUp]:[];
  const deep=rooms.filter(r=>r.routeDistance>=30&&goals.every(g=>r.routeDistance+distance(l.floor,r,g)-distance(l.floor,l.spawn,g)>=12));
  const guardTiles=[];
  for(let i=0;i<l.grid.length;i++)if(l.grid[i]) {
    const p=cellPoint(i%WIDTH,Math.floor(i/WIDTH));
    if(!isWalkable(l.floor,p.x,p.z,.65)||distance(l.floor,l.spawn,p)<20)continue;
    if(![[1.35,0],[0,1.35]].some(([x,z])=>isWalkable(l.floor,p.x+x,p.z+z,.65)&&isWalkable(l.floor,p.x-x,p.z-z,.65)))continue;
    guardTiles.push(p);
  }
  const guards=new Map(rooms.map(r=>[r.id,guardTiles.filter(p=>Math.hypot(p.x-r.x,p.z-r.z)<=12).map(p=>({...p,approach:distance(l.floor,r,p)})).filter(p=>p.approach<=18).sort((a,b)=>a.approach-b.approach||a.x-b.x||a.z-b.z)]));
  return {rooms,deep,guards,keys:rooms.filter(r=>r.depth>=2&&r.routeDistance>=30)};
});
export function createWorldObjects(random=Math.random,roleIds=ROLES) {
  const objects=[],roles=shuffle(roleIds,random),recruitFloors=shuffle(LEVELS.map(l=>l.floor),random).slice(0,4+Math.min(2,Math.floor(random()*3)));
  const keyFloors={a:random()<.5?4:5,b:random()<.5?7:8};let role=0;
  const add=(id,floor,p,type,name,extra={})=>objects.push({id,floor,x:p.x,z:p.z,type,name,done:false,...extra});
  for(const l of LEVELS) {
    const {floor}=l,pool=POOLS[floor-1],used=new Set();let exit=null;
    if(floor>=4){const p=shuffle(l.exits,random)[0];used.add(p.id);exit=p;add(`exit${floor}`,floor,p,'exit',`${floor}F 撤离口`);}
    const deep=pool.deep.filter(r=>!exit||l.stairUp||r.routeDistance+distance(floor,r,exit)-distance(floor,l.spawn,exit)>=12);
    if(l.stairUp)add(`up${floor}`,floor,l.stairUp,'stairsUp',`通往 ${floor+1}F`,{gate:`gate${floor}`});
    if(l.stairDown)add(`down${floor}`,floor,l.stairDown,'stairsDown',`返回 ${floor-1}F`,{gate:`gate${floor-1}`});
    for(const item of ['a','b'])if(keyFloors[item]===floor){const p=shuffle(pool.keys.filter(r=>!used.has(r.id)),random)[0];used.add(p.id);add(item==='a'?'keyA':'keyB',floor,p,'key',item==='a'?'资源 A':'资源 B',{item});}
    if(recruitFloors.includes(floor)) {
      const p=shuffle(deep.filter(r=>!used.has(r.id)),random)[0];used.add(p.id);
      add(`recruit${floor}-1`,floor,p,'recruit',`${NAMES[p.kind]} · 待援成员`,{role:roles[role++%roles.length]||ROLES[0]});
    }
    const valuable=shuffle(deep.filter(r=>!used.has(r.id)),random).slice(0,2);
    for(const p of valuable)used.add(p.id);
    const ordinary=shuffle(pool.rooms.filter(r=>!used.has(r.id)),random).slice(0,7);
    for(const [n,p]of [...valuable,...ordinary].entries())add(`crate${floor}-${n+1}`,floor,p,'crate',`${p.name} · ${n<valuable.length?'稀有箱':'物资箱'}`,{lootTier:floor,rare:n<valuable.length});
    const local=objects.filter(o=>o.floor===floor),occupied=[];
    const guarded=local.filter(o=>o.type==='recruit'||o.rare).map(o=>{
      const room=pool.rooms.find(r=>r.x===o.x&&r.z===o.z);
      o.guardsSpawned=false;o.guardSpawns=[];
      return {object:o,candidates:pool.guards.get(room.id).filter(p=>!local.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<3.5))};
    }).sort((a,b)=>a.candidates.length-b.candidates.length);
    // Two distinct bodies per valuable room keep density proportional to area.
    for(let round=0;round<2;round++)for(const {object:o,candidates}of guarded) {
      const p=candidates.find(p=>!occupied.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<2.5));
      if(!p)continue;
      const guard={x:p.x,z:p.z,kind:['elite','melee','ranged'][round]};
      o.guardSpawns.push(guard);occupied.push(guard);
    }
  }
  return objects;
}
