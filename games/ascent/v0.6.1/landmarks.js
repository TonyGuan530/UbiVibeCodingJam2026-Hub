/** Render-only architecture. All heights are bottoms relative to level.baseY.
 * Draw at [x, baseY+y+h/2, z], size [w,h,d]. No external assets or randomness.
 * Low parts fit existing collision solids; anything over a route starts at 2.6m.
 */
export const FLOOR_THEMES=Object.freeze([
  {floor:1,name:'接驳医疗',wall:'#d7e3df',floorColor:'#5b7576',pipe:'#82b9b1',accent:'#5ce0bb',cover:'#91a9a5',ceiling:'#8caaa5',landmark:'白十字病床站'},
  {floor:2,name:'样本储运',wall:'#9b8971',floorColor:'#4d514d',pipe:'#c28e4e',accent:'#f3b957',cover:'#78674f',ceiling:'#766d5c',landmark:'琥珀货运叠箱'},
  {floor:3,name:'维护工坊',wall:'#a69b70',floorColor:'#555a50',pipe:'#e9c347',accent:'#ffdc5d',cover:'#656b5d',ceiling:'#807d5b',landmark:'黄管双泵机组'},
  {floor:4,name:'研发档案',wall:'#8caeb3',floorColor:'#3d5869',pipe:'#55afbd',accent:'#79e1ec',cover:'#425c73',ceiling:'#63818f',landmark:'青光档案阵列'},
  {floor:5,name:'生化实验',wall:'#acc7df',floorColor:'#41546c',pipe:'#5499e1',accent:'#6cbbff',cover:'#5a7899',ceiling:'#738eac',landmark:'蓝灯样本观察窗'},
  {floor:6,name:'观测分析',wall:'#b1a6cc',floorColor:'#504b6c',pipe:'#a28bdd',accent:'#d5b1ff',cover:'#706785',ceiling:'#817492',landmark:'紫镜观测仪'},
  {floor:7,name:'安全控制',wall:'#aa7f81',floorColor:'#50434c',pipe:'#bf6e6d',accent:'#ff5d62',cover:'#66535c',ceiling:'#816269',landmark:'红灯封锁监控门'},
  {floor:8,name:'核心能源',wall:'#788c8a',floorColor:'#354d50',pipe:'#69c4ab',accent:'#9dffce',cover:'#416862',ceiling:'#5b7b76',landmark:'三柱能源反应堆'}
].map(Object.freeze));

const overlap=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2-1e-8&&Math.abs(a.z-b.z)<(a.d+b.d)/2-1e-8;

/** Derives all anchors from this floor's actual solids, openings and stair target.
 * `landmark:true` identifies the assembly nearest the real ascent (or top entry).
 * `anchor` and `kind` are optional consumer metadata, not collision registrations.
 */
export function buildLandmarks(level) {
  const theme=FLOOR_THEMES[level?.floor-1];
  if(!theme)return [];
  const result=[],walls=level.walls||[],covers=level.covers||[],shafts=level.stairwells||[];
  const maxHeight=Math.min(3.5,...walls.map(w=>w.h));
  const tiles=[];
  for(let i=0;i<(level.grid?.length||0);i++)if(level.grid[i])tiles.push({x:level.minX+(i%level.width+.5)*level.cellSize,z:level.minZ+(Math.floor(i/level.width)+.5)*level.cellSize,w:level.cellSize,d:level.cellSize});
  const add=part=>{
    if(!['x','z','w','d','h','y'].every(k=>Number.isFinite(part[k]))||part.w<=0||part.d<=0||part.h<=0||part.y<0||part.y+part.h>maxHeight+1e-8)return;
    if(part.x-part.w/2<level.minX||part.x+part.w/2>level.minX+level.width*level.cellSize||part.z-part.d/2<level.minZ||part.z+part.d/2>level.minZ+level.height*level.cellSize)return;
    if(shafts.some(s=>overlap(part,s)))return;
    if(part.y<2.6&&tiles.some(t=>overlap(part,t)))return;
    result.push(part);
  };
  const goal=level.stairUp||level.spawn||{x:0,z:0};
  const ordered=[...covers].sort((a,b)=>Math.hypot(a.x-goal.x,a.z-goal.z)-Math.hypot(b.x-goal.x,b.z-goal.z));
  // Equip several real rooms per floor, with the primary assembly by the ascent.
  for(const [index,c]of ordered.slice(0,6).entries()) {
    const u=Math.min(c.w,c.d)*.88,top=c.h+.045;
    const part=(kind,shape,dx,dz,w,d,h,y,color=theme.accent,extra={})=>add({shape,x:c.x+dx*u,z:c.z+dz*u,w:w*u,d:d*u,h,y,color,kind,anchor:'cover',landmark:index===0,...extra});
    if(level.floor===1) {
      part('bedMattress','box',0,0,.82,.94,.15,top,'#ecf5e9');
      part('bedPillow','box',0,-.3,.64,.23,.13,top+.15,'#ffffff');
      part('bedFootboard','box',0,.44,.88,.065,.3,top,theme.pipe);
      part('medicalCross','box',0,.03,.12,.52,.045,top+.15);
      part('medicalCross','box',0,.03,.46,.13,.047,top+.15);
    } else if(level.floor===2) {
      part('freightCrate','box',-.23,0,.44,.86,.54,top,'#bd935d');
      part('freightCrate','box',.24,.13,.43,.59,.84,top,'#b1a080');
      part('freightCrate','box',-.23,-.1,.4,.48,.33,top+.54,'#d8b57e');
      for(const x of [-.23,.24])part('freightBand','box',x,.14,.085,.58,.026,top+.85,theme.accent);
    } else if(level.floor===3) {
      part('maintenanceBase','box',0,0,.9,.82,.13,top,'#414c4e');
      for(const x of [-.24,.24]) {
        part('maintenancePump','cyl',x,0,.36,.36,.65,top+.13,'#9c9c7c');
        part('maintenancePipe','cyl',x,0,.16,.16,.43,top+.78,theme.pipe);
        part('maintenanceCap','oct',x,0,.29,.29,.1,top+1.21,theme.accent);
      }
      part('maintenancePipe','box',0,0,.68,.14,.12,top+1.08,theme.pipe);
    } else if(level.floor===4) {
      for(const x of [-.29,0,.29]) {
        part('archiveRack','box',x,0,.23,.74,.94,top,'#354d60');
        for(const y of [.14,.38,.62,.82])part('archiveSlot','box',x,.38,.18,.025,.055,top+y,theme.accent);
      }
      part('archiveHeader','box',0,0,.96,.8,.09,top+.94,theme.pipe);
    } else if(level.floor===5) {
      part('laboratoryTray','box',0,0,.9,.79,.09,top,'#e0eefa');
      for(const x of [-.28,0,.28]) {
        part('sampleTube','cyl',x,0,.2,.2,.77,top+.09,theme.accent,{alpha:.74});
        part('sampleCap','cyl',x,0,.23,.23,.09,top+.86,'#e1f4ff');
      }
      part('laboratoryLight','box',0,.34,.88,.055,.065,top+.1,theme.accent);
    } else if(level.floor===6) {
      part('observationPedestal','cyl',0,0,.55,.55,.42,top,'#6b6595');
      part('observationLens','oct',0,0,.88,.88,.16,top+.42,theme.accent);
      part('observationLens','cyl',0,0,.65,.65,.12,top+.58,'#e3daff');
      for(const x of [-.4,.4])part('observationFrame','box',x,0,.065,.77,.78,top,theme.pipe);
      part('observationFrame','box',0,0,.86,.08,.09,top+.78,theme.pipe);
    } else if(level.floor===7) {
      part('securityConsole','box',0,0,.88,.76,.45,top,'#3e424d');
      for(const x of [-.26,.26]) {
        part('securityMonitor','box',x,-.12,.35,.16,.31,top+.45,'#9ff2de');
        part('securityBeacon','cyl',x,.22,.16,.16,.23,top+.45,theme.accent);
      }
    } else {
      const height=Math.min(1.28,maxHeight-top-.2);
      for(const x of [-.3,0,.3]) {
        part('energyColumn','oct',x,0,.23,.3,height,top,theme.accent);
        for(const y of [0,height-.13])part('reactorCollar','oct',x,0,.29,.37,.13,top+y,'#c1e1cf');
      }
      part('coreBrace','box',0,0,.94,.17,.13,top+height,'#758d83');
      part('coreBrace','box',0,0,.14,.91,.13,top+height,'#758d83');
    }
  }

  // Exposed signs and glass attach to high wall faces, never to empty floor.
  const wallCandidates=[...walls].filter(w=>Math.max(w.w,w.d)>=Math.max(3,level.cellSize*2)).sort((a,b)=>Math.hypot(a.x-goal.x,a.z-goal.z)-Math.hypot(b.x-goal.x,b.z-goal.z));
  for(const wall of wallCandidates.slice(0,8)) {
    const alongX=wall.w>=wall.d,span=Math.min(2.3,Math.max(wall.w,wall.d)-.1);
    for(const sign of [-1,1]) {
      const x=wall.x+(alongX?0:sign*(wall.w/2+.055)),z=wall.z+(alongX?sign*(wall.d/2+.055):0);
      const face=(kind,across,h,y,color,extra={})=>add({shape:'box',x,z,w:alongX?across:.08,d:alongX?.08:across,h,y,color,kind,anchor:'wall',...extra});
      const forward={x:x+(alongX?0:sign*.055),z:z+(alongX?sign*.055:0)};
      if(level.floor===1) {
        face('medicalSign',span,.57,2.69,'#eaf4ec');
        face('medicalCross',span*.13,.44,2.75,theme.accent,forward);
        face('medicalCross',span*.46,.13,2.90,theme.accent,forward);
      } else if(level.floor===5||level.floor===6) {
        for(const y of [2.62,3.31])face('observationFrame',span,.09,y,theme.pipe);
        for(const side of [-1,1])face('observationFrame',.09,.78,2.62,theme.pipe,{x:x+(alongX?side*(span-.09)/2:0),z:z+(alongX?0:side*(span-.09)/2)});
        face('observationPane',span-.15,.60,2.71,level.floor===5?'#88caff':'#c3b5ff',{alpha:.47,...forward});
        face(level.floor===5?'laboratoryLight':'observationFrame',span,.055,3.40,theme.accent);
      } else if(level.floor===7) {
        face('cctvMount',.15,.24,3.12,'#293a44');
        add({shape:'box',x:x+(alongX?0:sign*.19),z:z+(alongX?sign*.19:0),w:alongX?.23:.5,d:alongX?.5:.23,h:.22,y:2.94,color:'#b9c8c7',kind:'cctvHead',anchor:'wall'});
      } else {
        face('floorBand',span,.15,3.14,theme.accent);
        if(level.floor===3)face('maintenancePipe',span,.11,2.89,theme.pipe);
      }
    }
  }
  // A mechanical/lockdown door silhouette uses only the existing high lintel;
  // keeping the lower opening empty matches its unchanged traversable collision.
  for(const door of (level.doorways||[]).slice(0,10)) {
    const alongZ=door.axis==='z',span=door.openingWidth+.16;
    const kind=level.floor===3?'mechanicalDoor':level.floor===7?'lockdownDoor':'themeDoorHeader';
    add({shape:'box',x:door.x,z:door.z,w:alongZ?.27:span,d:alongZ?span:.27,h:.24,y:2.96,color:theme.pipe,kind,anchor:'doorway'});
    if(level.floor===7)add({shape:'cyl',x:door.x,z:door.z,w:.24,d:.24,h:.17,y:3.20,color:theme.accent,kind:'securityBeacon',anchor:'doorway'});
  }
  return result;
}
