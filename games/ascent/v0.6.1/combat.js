import { updatePerception, positionSnapshot } from './perception.js?build=0.6.1';

// Main owns movement of squad members and individual invulnerability clocks.
// Combat owns enemy AI, projectiles, delayed attacks, statuses and FX clocks.
export const ROLES = Object.freeze({
  leader: { name: '领队', color: '#74d4ff', icon: '◆', description: '稳定单点射击，Perk可强化穿透与周期震荡。', position: '中程单点', hpContribution: 100, range: 8, interval: .6, damage: 18 },
  heavy: { name: '重装格斗者', color: '#ffbd70', icon: '拳', description: '近战范围重击，击退并短暂震晕怪群。', position: '近战范围 / 击退', hpContribution: 150, range: 2.8, interval: 1.6, damage: 35 },
  berserker: { name: '近战狂战士', color: '#ff779d', icon: '斩', description: '三段快速扇形连续斩击，适合近身清群。', position: '近战连斩', hpContribution: 150, range: 2.3, interval: 1.05, damage: 14 },
  sniper: { name: '狙击手', color: '#bc98ff', icon: '⌖', description: '超远距离高伤害射击，贯穿同一直线的敌人。', position: '远程穿透', hpContribution: 80, range: 15, interval: 1.8, damage: 52 },
  explosive: { name: '爆破专家', color: '#ff8659', icon: '✹', description: '投掷定点炸弹，预警0.65秒后造成范围爆炸。', position: '延迟范围爆破', hpContribution: 80, range: 9, interval: 2.1, damage: 55 },
  freeze: { name: '冰冻专家', color: '#8ceeff', icon: '❄', description: '冻结目标1秒，随后持续减速，阻止移动和攻击。', position: '远程冰冻 / 减速', hpContribution: 100, range: 7, interval: 1.5, damage: 14 },
  control: { name: '控场专家', color: '#b99cff', icon: '◎', description: '在怪群中生成引力场，持续拉拽并限制移动。', position: '群体拉拽 / 限制', hpContribution: 100, range: 7, interval: 3.1, damage: 12 },
  ricochet: { name: '弹射射手', color: '#b2f388', icon: '↗', description: '发射实体弹丸，碰敌后依次跳弹，遇墙反弹。', position: '实体跳弹 / 多目标', hpContribution: 100, range: 8, interval: 1.35, damage: 24 },
  electric: { name: '连锁电击者', color: '#f5ed8a', icon: 'ϟ', description: '即时电弧连续传导至附近四个敌人。', position: '即时多目标链电', hpContribution: 100, range: 7.5, interval: 1.65, damage: 21 },
});
export const ENEMIES = Object.freeze({
  melee: { name: '追猎者', color: '#d65f64', hp: 62, speed: 1.7, range: 1.05, interval: 1.1, damage: 9, scale: 1, xp: 3, dropChance: .16 },
  ranged: { name: '吐息者', color: '#dbad62', hp: 48, speed: 1.4, range: 10, interval: 2.8, damage: 13, scale: .9, xp: 5, dropChance: .25 },
  elite: { name: '重装异变体', color: '#d382eb', hp: 310, speed: 1, range: 2, interval: 3.1, damage: 30, scale: 1.65, xp: 15, dropChance: .8 },
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = positionSnapshot;
const active = (s, e) => e.alive && e.floor === s.floor;
const clear = (env, a, b) => Math.abs((a.y || 0) - (b.y || 0)) <= 2.2 && (!env.lineClear || env.lineClear(a, b));
const free = (env, x, z) => !env.walkable || env.walkable(x, z);
const decay = (obj, key, dt) => { obj[key] = Math.max(0, (obj[key] || 0) - dt); };
const actors = s => [s.player, ...s.allies].filter(a => a.alive !== false && (a.floor === undefined || a.floor === s.floor));
let enemySerial = 0;

export function makeEnemy(kind, x, z, floor = 1) {
  if (!ENEMIES[kind]) kind = 'melee';
  const spec = ENEMIES[kind];
  return { kind, combatId: ++enemySerial, x, z, floor, hp: spec.hp, maxHp: spec.hp, alive: true,
    atk: .9, fire: 0, hit: 0, dir: 0, angle: 0, phase: x * 2 + z,
    freeze: 0, slow: 0, stun: 0, root: 0, windup: 0, attackTarget: null, warning: null,
    awareness: 'idle', targetIndex: null, lastKnown: null, searchTimer: 0, alertTimer: 0 };
}
export function isBackstab(enemy, source) {
  if (!source) return false;
  const d = distance(enemy, source); if (d < .001) return false;
  const dot = ((source.x - enemy.x) * Math.sin(enemy.dir || 0) + (source.z - enemy.z) * Math.cos(enemy.dir || 0)) / d;
  // Rear 120-degree cone: side attacks are not backstabs.
  return dot <= -.5;
}
export function damageEnemy(s, e, amount, env = {}, source) {
  if (!e.alive || !Number.isFinite(amount) || amount <= 0) return false;
  const normalDamage = amount * (1 + .2 * Math.max(0, s.upgrades?.damage || 0) + (s.equipment?.amplifier ? .2 : 0));
  const backstab = isBackstab(e, source), dealt = normalDamage * (backstab ? 1.5 : 1);
  e.hp = Math.max(0, e.hp - dealt); e.hit = .15;
  if (backstab) {
    s.effects ??= [];
    s.effects.push({ type: 'backstab', ...point(e), amount: dealt, normalDamage, multiplier: 1.5, color: '#ffdd76', life: .85, maxLife: .85 });
  }
  env.onDamage?.({ enemy: e, amount: dealt, normalDamage, backstab, source: source ? point(source) : null });
  // Attack noise reaches only this struck enemy, never a global shared target.
  if (source && e.awareness === 'idle') { e.awareness = 'alert'; e.alertTimer = .18; e.lastKnown = point(source); e.searchTimer = 5; }
  if (e.hp > 0) return false;
  e.alive = false; e.windup = 0; e.attackTarget = null;
  if (e.warning) e.warning.life = 0; e.warning = null;
  s.totalKills = (s.totalKills || 0) + 1; env.onKill?.(e); return true;
}
function line(s, from, to, color, life = .15) { s.effects.push({ type: 'line', from: point(from), to: point(to), color, life, maxLife: life }); }
function circle(s, type, center, radius, color, life) {
  const fx = { type, ...point(center), radius, color, life, maxLife: life }; s.effects.push(fx); return fx;
}
function move(env, target, dt, e, speed) {
  const d = distance(e, target); if (d < .001 || speed <= 0) return;
  const limitedDt = Math.min(dt, d / speed);
  // Threat keeps growing after tier IV. Sweep even adapters which only test an
  // endpoint, so late-game speed cannot jump across narrow collision volumes.
  const pieces = Math.max(1, Math.ceil(speed * limitedDt / .08));
  for (let i = 0; i < pieces; i++) {
    if (env.move) { env.move(target.x, target.z, limitedDt / pieces, e, speed); continue; }
    const remaining = distance(e, target); if (remaining < .001) break;
    const ratio = Math.min(1, limitedDt / pieces * speed / remaining);
    const x = e.x + (target.x - e.x) * ratio, z = e.z + (target.z - e.z) * ratio;
    if (!free(env, x, z) || !clear(env, e, { ...e, x, z })) break;
    e.x = x; e.z = z;
  }
}
function displace(env, e, target) {
  const start = point(e), pieces = Math.max(1, Math.ceil(distance(e, target) / .1));
  for (let n = 1; n <= pieces; n++) {
    const next = { ...e, x: start.x + (target.x - start.x) * n / pieces, z: start.z + (target.z - start.z) * n / pieces };
    if (!free(env, next.x, next.z) || !clear(env, e, next)) break; e.x = next.x; e.z = next.z;
  }
}
function hurtActor(s, actor, amount, env) {
  if ((s.team?.hp ?? s.player.hp) <= 0 || actor.invuln > 0) return;
  if (env.damageActor) env.damageActor(actor, amount);
  else if (env.damagePlayer) env.damagePlayer(amount);
  else if (s.team) s.team.hp = Math.max(0, s.team.hp - amount);
  else s.player.hp = Math.max(0, s.player.hp - amount);
}
function shock(s, actor, radius, damage, color, env) {
  circle(s, 'pulse', actor, radius, color, .5);
  for (const e of s.enemies) {
    if (!active(s, e) || distance(actor, e) > radius || !clear(env, actor, e)) continue;
    damageEnemy(s, e, damage, env, actor); if (!e.alive) continue;
    e.stun = Math.max(e.stun || 0, .8);
    const d = distance(actor, e) || 1;
    displace(env, e, { x: e.x + (e.x - actor.x) / d * .9, z: e.z + (e.z - actor.z) / d * .9 });
  }
}
function slash(s, a, spec, env) {
  circle(s, 'pulse', a, spec.range, spec.color, .18);
  for (const e of s.enemies) {
    if (!active(s,e) || distance(a,e)>spec.range || !clear(env,a,e)) continue;
    const delta = Math.atan2(e.x-a.x,e.z-a.z)-a.dir;
    if (Math.cos(delta) < Math.cos(.8)) continue;
    damageEnemy(s,e,spec.damage,env,a); line(s,a,e,spec.color,.12);
  }
}
function fireAllies(s, dt, env) {
  const rapid = Math.pow(.82, Math.max(0, s.upgrades?.rapid || 0));
  for (const a of actors(s)) {
    const role = a.role || 'leader', spec = ROLES[role] || ROLES.leader;
    // A berserker commits to a three-slash burst; each strike rechecks actual
    // position, range and walls rather than applying three invisible hits.
    if (a.comboRemaining > 0) {
      a.comboTimer -= dt;
      while (a.comboRemaining > 0 && a.comboTimer <= 1e-8) { slash(s,a,spec,env); a.comboRemaining--; a.comboTimer += .14 * rapid; }
    }
    a.fire = (a.fire || 0) - dt; if (a.fire > 1e-8) continue;
    const targets = s.enemies.filter(e => active(s,e) && distance(a,e)<=spec.range && clear(env,a,e)).sort((x,y)=>distance(a,x)-distance(a,y));
    const target = targets[0]; if (!target) { a.fire=0; continue; }
    a.fire += spec.interval * rapid; a.dir = Math.atan2(target.x-a.x,target.z-a.z);
    const hit = (e, damage = spec.damage, from = a) => { damageEnemy(s,e,damage,env,from); line(s,from,e,spec.color); };
    if (role === 'heavy') shock(s,a,spec.range,spec.damage,spec.color,env);
    else if (role === 'berserker') { slash(s,a,spec,env); a.comboRemaining=2; a.comboTimer=.14*rapid; }
    else if (role === 'sniper') {
      const dx=Math.sin(a.dir),dz=Math.cos(a.dir);
      for (const e of targets) if ((e.x-a.x)*dx+(e.z-a.z)*dz>=0 && Math.abs((e.x-a.x)*dz-(e.z-a.z)*dx)<.42) hit(e);
    } else if (role === 'freeze') {
      hit(target); target.freeze=Math.max(target.freeze||0,1);target.slow=Math.max(target.slow||0,3);circle(s,'pulse',target,.8,spec.color,.45);
    } else if (role === 'electric') {
      const visited = new Set(); let current=target,previous=a;
      for (let hop=0;current&&hop<4;hop++) {
        visited.add(current);hit(current,spec.damage*Math.pow(.85,hop),previous); previous=current;
        current=s.enemies.filter(e=>active(s,e)&&!visited.has(e)&&distance(previous,e)<=4.2&&clear(env,previous,e)).sort((x,y)=>distance(previous,x)-distance(previous,y))[0];
      }
    } else if (role === 'explosive') {
      const center=point(target);line(s,a,center,spec.color,.3);
      const warning=circle(s,'telegraph',center,2.5,spec.color,.65);
      s.attacks.push({type:'explosion',...center,floor:s.floor,delay:.65,radius:2.5,damage:spec.damage,source:point(a),color:spec.color,warning});
    } else if (role === 'control') {
      const center=point(target);circle(s,'pulse',center,3,spec.color,1.4);
      s.attacks.push({type:'gravity',...center,floor:s.floor,life:1.4,radius:3,source:point(a),color:spec.color});
      for(const e of s.enemies) if(active(s,e)&&distance(center,e)<=3&&clear(env,a,e)&&clear(env,center,e)) {hit(e);e.root=Math.max(e.root||0,.45);}
    } else if (role === 'ricochet') {
      s.bullets.push({...point(a),dx:Math.sin(a.dir),dz:Math.cos(a.dir),speed:12,life:3,damage:spec.damage,color:spec.color,owner:'ally',radius:.13,floor:s.floor,hops:3,wallBounces:2,visited:[],source:point(a)});
    } else {
      hit(target);
      if (s.upgrades?.pierce>0) {
        const dx=Math.sin(a.dir),dz=Math.cos(a.dir),first=distance(a,target);
        const extra=targets.filter(e=>e!==target&&distance(a,e)>first&&(e.x-a.x)*dx+(e.z-a.z)*dz>0&&Math.abs((e.x-a.x)*dz-(e.z-a.z)*dx)<.5).slice(0,Math.ceil(s.upgrades.pierce));
        for(const e of extra) hit(e,spec.damage*.7);
      }
    }
  }
  if (s.upgrades?.shock>0) {
    s.shockTimer=(s.shockTimer??4)-dt;
    if(s.shockTimer<=0){s.shockTimer=4;shock(s,s.player,3.3+.45*s.upgrades.shock,15,ROLES.heavy.color,env);}
  }
}
function enemyAI(s,dt,env,threat) {
  const intervalScale=1/(1+(threat-1)*.12), squad=actors(s);
  for(const e of s.enemies) {
    if(!active(s,e))continue;
    for(const key of ['hit','freeze','slow','stun','root'])decay(e,key,dt);
    if(e.freeze>0||e.stun>0){if(e.warning)e.warning.life=e.windup+.05;continue;}
    const perception=updatePerception(e,squad,dt,env),target=perception.target,goal=perception.goal;
    const spec=ENEMIES[e.kind]||ENEMIES.melee,slow=e.slow>0?.45:1;
    decay(e,'atk',dt*slow);
    if(goal&&distance(e,goal)>.1)e.dir=e.angle=Math.atan2(goal.x-e.x,goal.z-e.z);
    else if(e.awareness==='search')e.dir=e.angle=(e.dir||0)+dt*1.8;
    if(e.windup>0){
      e.windup=Math.max(0,e.windup-dt*slow);if(e.warning)e.warning.life=e.windup+.05;if(e.windup>0)continue;
      if(e.kind==='ranged'){
        const aim=e.attackTarget,angle=Math.atan2(aim.x-e.x,aim.z-e.z),count=threat>=3?3:1;
        for(let i=0;i<count;i++){const a=angle+(i-(count-1)/2)*.19;s.bullets.push({...point(e),dx:Math.sin(a),dz:Math.cos(a),speed:6.5,life:3,damage:spec.damage,color:'#ffb465',owner:'enemy',radius:.2,floor:s.floor});}
      }else if(e.kind==='elite'){
        circle(s,'pulse',e.attackTarget,1.8,spec.color,.4);
        for(const a of squad)if(distance(a,e.attackTarget)<=1.8&&clear(env,e,a))hurtActor(s,a,spec.damage,env);
      }
      if(e.warning)e.warning.life=0;e.warning=null;e.attackTarget=null;e.atk=spec.interval*intervalScale;continue;
    }
    if(!goal)continue;
    const speed=spec.speed*(1+(threat-1)*.1)*slow*(e.root>0?.12:1);
    if(!target){if(distance(e,goal)>.3)move(env,env.pathTarget?.(e,goal)||goal,dt,e,speed);continue;}
    const d=distance(e,target),sight=clear(env,e,target);
    if(e.kind==='ranged'){
      if(sight&&d<4.6){const len=d||1;move(env,{...e,x:e.x+(e.x-target.x||.1)/len*2,z:e.z+(e.z-target.z)/len*2},dt,e,speed);}
      else if(!sight||d>8)move(env,env.pathTarget?.(e,goal)||goal,dt,e,speed);
      if(sight&&d<=spec.range&&e.atk<=0){e.attackTarget=point(target);e.windup=.65;e.warning=circle(s,'telegraph',e.attackTarget,.7,spec.color,e.windup+.05);line(s,e,e.attackTarget,spec.color,e.windup);}
    }else{
      if(d>(e.kind==='elite'?1.4:.75)||!sight)move(env,env.pathTarget?.(e,goal)||goal,dt,e,speed);
      if(d<=spec.range&&sight&&e.atk<=0){
        if(e.kind==='elite'){e.attackTarget=point(target);e.windup=.95;e.warning=circle(s,'telegraph',e.attackTarget,1.8,spec.color,e.windup+.05);}
        else{hurtActor(s,target,spec.damage,env);e.atk=spec.interval*intervalScale;}
      }
    }
  }
}
function stepAttacks(s,dt,env){
  for(const attack of s.attacks){
    if(attack.floor!==s.floor){attack.life=0;attack.delay=-1;continue;}
    if(attack.type==='explosion'){
      attack.delay-=dt;if(attack.delay>1e-8||attack.done)continue;attack.done=true;if(attack.warning)attack.warning.life=0;
      circle(s,'pulse',attack,attack.radius,attack.color,.55);
      for(const e of s.enemies)if(active(s,e)&&distance(attack,e)<=attack.radius&&clear(env,attack,e))damageEnemy(s,e,attack.damage,env,attack.source);
    }else if(attack.type==='gravity'){
      attack.life-=dt;
      for(const e of s.enemies)if(active(s,e)&&distance(attack,e)<=attack.radius&&clear(env,attack,e)){
        e.root=Math.max(e.root||0,.2);const d=distance(e,attack);if(d>.35)displace(env,e,{x:e.x+(attack.x-e.x)/d*Math.min(d-.35,2.5*dt),z:e.z+(attack.z-e.z)/d*Math.min(d-.35,2.5*dt)});
      }
    }
  }
  s.attacks=s.attacks.filter(a=>a.type==='explosion'?!a.done&&a.delay>=0:a.life>0);
}
function stepBullets(s,dt,env){
  for(const b of s.bullets){
    b.life-=dt;if(b.life<=0||(b.floor!==undefined&&b.floor!==s.floor)){b.life=0;continue;}
    const travel=b.speed*dt,pieces=Math.max(1,Math.ceil(travel/.08));
    for(let i=0;i<pieces&&b.life>0;i++){
      const next={...b,x:b.x+b.dx*travel/pieces,z:b.z+b.dz*travel/pieces};
      if(!free(env,next.x,next.z)||!clear(env,b,next)){
        if(b.owner==='ally'&&b.wallBounces>0){
          const xClear=free(env,next.x,b.z)&&clear(env,b,{...b,x:next.x});
          const zClear=free(env,b.x,next.z)&&clear(env,b,{...b,z:next.z});
          if(!xClear)b.dx=-b.dx;if(!zClear)b.dz=-b.dz;if(xClear&&zClear){b.dx=-b.dx;b.dz=-b.dz;}
          b.wallBounces--;circle(s,'pulse',b,.25,b.color,.15);continue;
        }
        b.life=0;break;
      }
      const before=point(b);b.x=next.x;b.z=next.z;
      if(b.owner==='enemy'){
        const a=actors(s).find(a=>distance(b,a)<=.42+(b.radius||.15)&&clear(env,b,a));
        if(a){hurtActor(s,a,b.damage,env);b.life=0;}
      }else if(b.owner==='ally'){
        const e=s.enemies.find(e=>active(s,e)&&!(b.visited||[]).includes(e.combatId)&&distance(b,e)<=.4+(b.radius||.13)&&clear(env,b,e));
        if(!e)continue;
        // Each physical impact uses the incoming segment, not an old shooter
        // location; a bent shot can approach from a different side.
        damageEnemy(s,e,b.damage,env,before);
        b.visited??=[];b.visited.push(e.combatId);
        if(b.hops--<=0){b.life=0;continue;}
        const target=s.enemies.filter(candidate=>active(s,candidate)&&!b.visited.includes(candidate.combatId)&&distance(b,candidate)<=5&&clear(env,b,candidate)).sort((x,y)=>distance(b,x)-distance(b,y))[0];
        if(!target){b.life=0;continue;}const d=distance(b,target)||1;b.dx=(target.x-b.x)/d;b.dz=(target.z-b.z)/d;b.damage*=.85;
      }
    }
  }
  s.bullets=s.bullets.filter(b=>b.life>0);
}
export function stepCombat(s,dt,env={}){
  if(!s||!s.player||!Number.isFinite(dt)||dt<=0)return;
  s.effects??=[];s.bullets??=[];s.allies??=[];s.enemies??=[];s.attacks??=[];
  const threat=Math.max(1,env.threat?.()??(1+Math.floor((s.t||0)/120)));
  for(let remaining=dt;remaining>1e-8;){
    const slice=Math.min(.04,remaining);remaining-=slice;
    for(const fx of s.effects)fx.life-=slice;s.effects=s.effects.filter(fx=>fx.life>0);
    enemyAI(s,slice,env,threat);fireAllies(s,slice,env);stepAttacks(s,slice,env);stepBullets(s,slice,env);
  }
}
