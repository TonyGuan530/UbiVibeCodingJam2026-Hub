// One shared pool; actor aliases keep the existing save/UI/combat surface coherent.
function bind(actor,team){
 Object.defineProperties(actor,{
  hp:{enumerable:true,configurable:true,get:()=>team.hp,set:n=>{if(Number.isFinite(n))team.hp=Math.max(0,Math.min(team.maxHp,n))}},
  maxHp:{enumerable:true,configurable:true,get:()=>team.maxHp},
 });
 actor.invuln=0;
}
export function createTeam(player){const team={hp:100,maxHp:100};bind(player,team);return team}
export function recruitMember(game,member,contribution){
 if(!game?.team||!member||game.allies.length>=3||game.allies.includes(member)||game.allies.some(a=>a.id&&a.id===member.id))return{ok:false,reason:'full_or_duplicate'};
 if(![80,100,150].includes(contribution)||game.team.hp<=0)return{ok:false,reason:'invalid_contribution'};
 game.team.hp+=contribution;game.team.maxHp+=contribution;member.hpContribution=contribution;
 bind(member,game.team);game.allies.push(member);return{ok:true,hp:game.team.hp,maxHp:game.team.maxHp};
}
export function damageTeam(game,actor,amount){
 if(!game?.team||!(actor===game.player||game.allies.includes(actor))||actor.invuln>0||!Number.isFinite(amount)||amount<=0||game.team.hp<=0)return 0;
 const applied=Math.min(game.team.hp,amount);game.team.hp-=applied;actor.invuln=.52;actor.hurt=.3;return applied;
}
export function healTeam(game,amount){
 if(!game?.team||game.team.hp<=0||!Number.isFinite(amount)||amount<=0)return 0;
 const applied=Math.min(amount,game.team.maxHp-game.team.hp);game.team.hp+=applied;return applied;
}
