// Commodity values and per-slot odds are balance data, independent of UI and inventory.
export const RARITIES = Object.freeze([
  ['common', '普通', '白', '#E5E7EB'], ['uncommon', '优良', '绿', '#4ADE80'],
  ['rare', '稀有', '蓝', '#60A5FA'], ['epic', '史诗', '紫', '#C084FC'],
  ['legendary', '传说', '橙', '#FB923C'], ['relic', '至宝', '红', '#EF4444'],
].map(([id, name, label, color]) => Object.freeze({id, name, label, color})));

export const COMMODITIES = Object.freeze(Object.fromEntries([
  ['cargo_gear', '锈蚀齿轮', 0, 1, 1, 25],
  ['cargo_battery', '旧电池', 0, 1, 1, 30],
  ['cargo_tape', '电工胶带', 0, 1, 1, 35],
  ['cargo_board', '破损电路板', 0, 1, 2, 48],
  ['cargo_filter', '废旧过滤器', 0, 1, 2, 55],
  ['cargo_coil', '工业线圈', 0, 2, 1, 60],
  ['cargo_reagent', '医疗试剂', 1, 1, 1, 110],
  ['cargo_energy', '密封能源单元', 1, 1, 2, 140],
  ['cargo_alloy', '高纯合金', 1, 1, 2, 160],
  ['cargo_sensor', '精密传感器', 1, 2, 1, 180],
  ['cargo_security', '安保芯片组', 1, 2, 2, 240],
  ['cargo_cell', '高能电芯', 2, 1, 2, 420],
  ['cargo_disk', '实验数据盘', 2, 1, 1, 450],
  ['cargo_controller', '军规控制器', 2, 2, 2, 620],
  ['cargo_magnet', '磁约束组件', 2, 2, 2, 720],
  ['cargo_quantum', '量子样本', 3, 1, 2, 1050],
  ['cargo_genome', '基因序列盒', 3, 2, 2, 1300],
  ['cargo_regulator', '反应堆调节器', 3, 2, 3, 1800],
  ['cargo_neural', '原型神经芯片', 4, 2, 2, 2800],
  ['cargo_zero', '零点能源模组', 4, 2, 3, 4200],
  ['cargo_blackbox', '禁区黑匣子', 5, 2, 3, 8000],
].map(([id, name, rarity, w, h, value]) => [id, Object.freeze({
  id, name, rarity, w, h, value, type: 'commodity', maxStack: 1,
  color: RARITIES[rarity].color, use: `可交易货品；成功带出后保留在仓库，估值 ${value} 信用点`,
})])));

export const CHEST_TABLES = Object.freeze(Object.fromEntries([
  ['normal', '普通宝箱', [62,28,9,1,0,0], 1,3,'#9CA3AF'],
  ['advanced', '高级宝箱', [35,30,20,11,3,1], 2,4,'#60A5FA'],
  ['elite', '精英守护宝箱', [15,22,27,20,11,5], 2,4,'#FB923C'],
].map(([id,name,weights,min,max,color]) => [id,Object.freeze({id,name,weights:Object.freeze(weights),min,max,color})])));

const pools = RARITIES.map((_, rarity) => Object.keys(COMMODITIES).filter(id => COMMODITIES[id].rarity === rarity));
const unit = rng => {
  const n = rng();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('Random source must return a number in [0,1)');
  return n;
};
function weightedIndex(weights, rng) {
  let value = unit(rng) * weights.reduce((a,b) => a+b,0);
  for (let i=0; i<weights.length; i++) { value -= weights[i]; if(value<0) return i; }
  throw new RangeError('Invalid probability table');
}

// Existing deep-room rare flags retain their risk placement and guards.
export function chestTier(floor, rare = false, index = 0) {
  if (floor <= 3) return 'normal';
  if (floor <= 6) return rare ? 'advanced' : 'normal';
  return rare ? index === 0 ? 'elite' : 'advanced' : 'normal';
}

export function rollCargoSlot(tier, rng = Math.random) {
  const table = CHEST_TABLES[tier];
  if (!table) throw new RangeError('Unknown chest tier');
  const pool = pools[weightedIndex(table.weights,rng)];
  return {id:pool[Math.floor(unit(rng)*pool.length)],qty:1};
}
export function rollCargo(tier, rng = Math.random) {
  const table = CHEST_TABLES[tier];
  if (!table) throw new RangeError('Unknown chest tier');
  const count=table.min+Math.floor(unit(rng)*(table.max-table.min+1));
  return Array.from({length:count},()=>rollCargoSlot(tier,rng));
}

export const CONTRACTS = Object.freeze([
  Object.freeze({id:'green2',minRarity:1,required:2,bonus:250,label:'绿色',weight:50}),
  Object.freeze({id:'blue1',minRarity:2,required:1,bonus:500,label:'蓝色',weight:35}),
  Object.freeze({id:'purple1',minRarity:3,required:1,bonus:1200,label:'紫色',weight:15}),
]);
export function createContract(rng = Math.random) {
  return {...CONTRACTS[weightedIndex(CONTRACTS.map(c=>c.weight),rng)]};
}

// Only actual unique carried instances count; qty and warehouse counters are never task progress.
function actualCargo(items) {
  const seen=new Set();
  return (Array.isArray(items)?items:[]).filter(item=>{
    if (!COMMODITIES[item?.id] || typeof item.uid!=='string' || !item.uid || seen.has(item.uid)) return false;
    seen.add(item.uid); return true;
  });
}
export function progressContract(contract, items) {
  if (!contract) return {count:0,required:0,complete:false};
  const count=actualCargo(items).filter(item=>COMMODITIES[item.id].rarity>=contract.minRarity).length;
  return {count,required:contract.required,complete:count>=contract.required};
}
export function summarizeCargo(items) {
  const cargo=actualCargo(items), counts=RARITIES.map(()=>0);
  let value=0;
  for(const item of cargo){const spec=COMMODITIES[item.id];counts[spec.rarity]++;value+=spec.value;}
  return {items:structuredClone(cargo),counts,value};
}

const balance = n => Number.isSafeInteger(n)&&n>=0 ? n : 0;
// Call once at a terminal run outcome; the run retains its receipt even after save/reload serialization.
// Inventory persistence remains owned by the existing extraction/warehouse system.
export function settleEconomy(run, save, success, items) {
  if(run.economySettlement) return run.economySettlement;
  const summary=summarizeCargo(success?items:[]);
  const contractComplete=!!success&&progressContract(run.contract,items).complete;
  const bonus=contractComplete?run.contract.bonus:0;
  save.totalExtractedValue=balance(save.totalExtractedValue)+summary.value;
  save.credits=balance(save.credits)+bonus;
  run.economySettlement={...summary,success:!!success,contractComplete,bonus,total:summary.value+bonus,
    cumulativeValue:save.totalExtractedValue,credits:save.credits};
  return run.economySettlement;
}
