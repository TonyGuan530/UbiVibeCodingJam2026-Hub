import {SETTINGS} from './config.js?build=0.6.2';
// Stage IV is a performance cap, not a time cap. Later tiers keep increasing
// cadence, composition, speed and attack frequency without inflating HP/damage.
export function pressureAt(time){
 const t=Number.isFinite(time)?Math.max(0,time):0,tier=1+Math.floor(t/SETTINGS.threatStepSeconds),stage=Math.min(4,tier),extra=Math.max(0,tier-4);
 return {tier,stage,cap:SETTINGS.enemyCaps[stage-1]*3,
  interval:SETTINGS.enemySpawnIntervals[stage-1]/(1+.15*extra),
  batch:3*Math.min(10,SETTINGS.enemySpawnBatch[stage-1]+Math.floor(extra/2)),
  eliteChance:Math.min(.6,.16+(tier-1)*.025),rangedChance:Math.min(.5,.25+(tier-1)*.018),
  movementScale:1+(tier-1)*.1,attackScale:1/(1+(tier-1)*.12)};
}
