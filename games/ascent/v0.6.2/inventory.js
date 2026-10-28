// Plain JSON data only: safe to save with JSON.stringify and restore with JSON.parse.
import {COMMODITIES} from './economy.js?build=0.6.2';
export const ITEMS = Object.freeze({...COMMODITIES,...Object.fromEntries([
  ['wire', '导线', 'material', 1, 1, 6, '旧仓库藏品；本版停止掉落，无试炼消耗', '#efc66f'],
  ['alloy', '合金板', 'material', 1, 2, 4, '旧仓库藏品；本版停止掉落，无试炼消耗', '#9baeb8'],
  ['circuit', '电路板', 'material', 2, 1, 4, '旧仓库藏品；本版停止掉落，无试炼消耗', '#72c6a4'],
  ['med', '急救包', 'medical', 1, 2, 2, '使用后恢复40点小队共享生命；消耗本件', '#e28b88'],
  ['a', '研究样本 A', 'key', 2, 2, 1, '搜索4L或5L深处，成功撤离后入库', '#76bbf5'],
  ['b', '核心样本 B', 'key', 2, 3, 1, '搜索7L或8L深处，成功撤离后入库', '#c3a1ef'],
  ['scrap', '零件碎料', 'material', 1, 1, 8, '旧仓库藏品；本版停止掉落，无试炼消耗', '#c4a18b'],
  ['battery', '医疗电池', 'medical', 1, 1, 4, '使用本件恢复20点小队共享生命', '#e7d577'],
  ['gear', '传动组件', 'material', 2, 2, 1, '旧仓库藏品；本版停止掉落，无试炼消耗', '#a1b0bd'],
  ['capacitor', '储能电容', 'material', 2, 3, 1, '旧仓库藏品；本版停止掉落，无试炼消耗', '#80cbd5'],
  ['vest', '防护背心', 'equipment', 2, 3, 1, '装备后本趟受到伤害降低20%，撤离后入库', '#76bbf5'],
  ['amplifier', '脉冲放大器', 'equipment', 2, 2, 1, '装备后自动攻击伤害提高20%，撤离后入库', '#c3a1ef'],
].map(([id, name, type, w, h, maxStack, use, color]) =>
  [id, Object.freeze({ id, name, type, w, h, maxStack: 1, use, color })]))});

const integer = value => Number.isSafeInteger(value);
const positive = value => integer(value) && value > 0;
const definition = id => typeof id === 'string' && Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
const bagShape = bag => bag && positive(bag.width) && positive(bag.height)
  && Number.isSafeInteger(bag.width * bag.height) && Array.isArray(bag.items);
const failure = reason => ({ ok: false, reason });

export function createBag(width = 8, height = 6) {
  if (!positive(width) || !positive(height) || !Number.isSafeInteger(width * height)) {
    throw new RangeError('Bag dimensions must be positive safe integers');
  }
  return { width, height, items: [] };
}

/** Accept an item instance, a catalog definition, or an item id. */
export function dimensions(item, rotated = item?.rotated ?? false) {
  const spec = definition(typeof item === 'string' ? item : item?.id);
  if (!spec || typeof rotated !== 'boolean') return null;
  const w = item?.w ?? spec.w, h = item?.h ?? spec.h;
  if (!positive(w) || !positive(h)) return null;
  return rotated ? { w: h, h: w } : { w, h };
}

export function canPlace(bag, item, x, y, rotated = item?.rotated ?? false, ignoreUid = item?.uid) {
  const size = dimensions(item, rotated);
  if (!bagShape(bag) || !size || !integer(x) || !integer(y) || x < 0 || y < 0
    || x + size.w > bag.width || y + size.h > bag.height) return false;
  for (const other of bag.items) {
    if (ignoreUid !== undefined && other?.uid === ignoreUid) continue;
    const bounds = dimensions(other);
    if (!bounds || !integer(other.x) || !integer(other.y)) return false;
    if (x < other.x + bounds.w && x + size.w > other.x
      && y < other.y + bounds.h && y + size.h > other.y) return false;
  }
  return true;
}

/** Validate persisted data before using it; does not migrate or silently discard goods. */
export function validateBag(bag) {
  if (!bagShape(bag)) return { ok: false, errors: ['invalid_bag'] };
  const errors = [];
  const seen = new Set();
  for (const item of bag.items) {
    const spec = definition(item?.id);
    if (!item || typeof item.uid !== 'string' || item.uid.length === 0 || seen.has(item.uid)) {
      errors.push('invalid_uid');
    }
    seen.add(item?.uid);
    if (!spec || !positive(item.qty) || item.qty > spec.maxStack || typeof item.rotated !== 'boolean') {
      errors.push('invalid_item');
    }
    if (!canPlace(bag, item, item?.x, item?.y)) errors.push('invalid_placement');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function bagItems(bag) {
  return Array.isArray(bag?.items) ? structuredClone(bag.items) : [];
}

export function occupiedCells(bag) {
  return bagItems(bag).reduce((total, item) => {
    const size = dimensions(item);
    return total + (size ? size.w * size.h : 0);
  }, 0);
}

export function countItem(bag, id) {
  if (!definition(id) || !Array.isArray(bag?.items)) return 0;
  return bag.items.reduce((total, item) => total + (item.id === id ? item.qty : 0), 0);
}

// UUIDs remain distinct between independent containers, dropped goods and reloads.
let serial = 0;
const sessionId = Math.random().toString(36).slice(2);
function nextUid() {
  return globalThis.crypto?.randomUUID?.() ?? `item-${sessionId}-${Date.now().toString(36)}-${++serial}`;
}

function findPlacement(bag, item) {
  for (const rotated of [false, true]) {
    const size = dimensions(item, rotated);
    for (let y = 0; y <= bag.height - size.h; y++) {
      for (let x = 0; x <= bag.width - size.w; x++) {
        if (canPlace(bag, item, x, y, rotated)) return { x, y, rotated };
      }
    }
  }
  return null;
}

/** Entire batch succeeds or the bag stays byte-for-byte unchanged. Every unit occupies cells. */
export function addItem(bag, id, qty = 1) {
  const spec = definition(id);
  if (!spec) return failure('unknown_item');
  if (!positive(qty)) return failure('invalid_quantity');
  if (!validateBag(bag).ok) return failure('invalid_bag');
  const draft = { width: bag.width, height: bag.height, items: bagItems(bag) };
  let remaining = qty;
  const uids = [];
  // Bound huge requests before allocation; this is an upper bound, never a fit guarantee.
  const availableStacks = Math.floor((bag.width * bag.height - occupiedCells(draft)) / (spec.w * spec.h));
  if (Math.ceil(remaining / spec.maxStack) > availableStacks) return failure('no_space');
  while (remaining > 0) {
    const item = { uid: nextUid(), id, qty: 1, w: spec.w, h: spec.h,
      x: 0, y: 0, rotated: false, attributes: {} };
    const placement = findPlacement(draft, item);
    if (!placement) return failure('no_space');
    Object.assign(item, placement);
    draft.items.push(item);
    uids.push(item.uid);
    remaining -= item.qty;
  }
  bag.items.splice(0, bag.items.length, ...draft.items);
  return { ok: true, added: qty, uids };
}

export function moveItem(bag, uid, x, y, rotated) {
  if (!validateBag(bag).ok) return failure('invalid_bag');
  const item = bag.items.find(entry => entry.uid === uid);
  if (!item) return failure('item_not_found');
  rotated ??= item.rotated;
  if (!canPlace(bag, item, x, y, rotated)) return failure('invalid_placement');
  Object.assign(item, { x, y, rotated });
  return { ok: true };
}

export function rotateItem(bag, uid) {
  const item = bag?.items?.find(entry => entry.uid === uid);
  if (!item) return failure('item_not_found');
  return moveItem(bag, uid, item.x, item.y, !item.rotated);
}

/** Omitted qty removes the whole instance. Returned item is detached from bag data. */
export function removeItem(bag, uid, qty) {
  if (!validateBag(bag).ok) return null;
  const index = bag.items.findIndex(item => item.uid === uid);
  if (index < 0) return null;
  const item = bag.items[index];
  qty ??= item.qty;
  if (!positive(qty) || qty > item.qty) return null;
  const removed = structuredClone(item);
  item.qty -= qty;
  if (item.qty === 0) bag.items.splice(index, 1);
  return removed;
}

/** Check all ingredients before spending any. Zero requirements are harmless no-ops. */
export function consumeItems(bag, requirements) {
  if (!validateBag(bag).ok || !requirements || typeof requirements !== 'object' || Array.isArray(requirements)) {
    return { ok: false, missing: {}, reason: 'invalid_recipe' };
  }
  const entries = Object.entries(requirements);
  if (entries.some(([id, qty]) => !definition(id) || !integer(qty) || qty < 0)) {
    return { ok: false, missing: {}, reason: 'invalid_recipe' };
  }
  const missing = Object.fromEntries(entries
    .map(([id, qty]) => [id, Math.max(0, qty - countItem(bag, id))])
    .filter(([, qty]) => qty > 0));
  if (Object.keys(missing).length) return { ok: false, missing };
  const draft = bagItems(bag);
  for (const [id, required] of entries) {
    let remaining = required;
    for (const item of draft) {
      if (item.id !== id || remaining === 0) continue;
      const amount = Math.min(remaining, item.qty);
      item.qty -= amount;
      remaining -= amount;
    }
  }
  bag.items.splice(0, bag.items.length, ...draft.filter(item => item.qty > 0));
  return { ok: true, missing: {} };
}

/** Expand old {id,qty} goods into independent JSON instances; never discard unknown goods. */
export function normalizeLoot(loot = []) {
  if (!Array.isArray(loot)) throw new TypeError('Loot must be an array');
  const result = [], seen = new Set();
  for (const raw of loot) {
    const spec = definition(raw?.id), qty = raw?.qty ?? 1;
    if (!spec || !positive(qty) || !dimensions(raw)) throw new TypeError('Invalid loot item');
    for (let index = 0; index < qty; index++) {
      let uid = index === 0 && typeof raw.uid === 'string' && raw.uid.length && !seen.has(raw.uid) ? raw.uid : nextUid();
      while (seen.has(uid)) uid = nextUid();
      seen.add(uid);
      result.push({ ...structuredClone(raw), uid, id: raw.id, qty: 1,
        w: raw.w ?? spec.w, h: raw.h ?? spec.h,
        x: integer(raw.x) ? raw.x : 0, y: integer(raw.y) ? raw.y : 0,
        rotated: typeof raw.rotated === 'boolean' ? raw.rotated : false,
        attributes: structuredClone(raw.attributes ?? {}) });
    }
  }
  return result;
}

/** Source owns the array: all later transfers update o.loot in place. */
export function containerBag(source) {
  if (!source || typeof source !== 'object') throw new TypeError('Container source required');
  source.loot ??= [];
  const items = normalizeLoot(source.loot);
  source.loot.splice(0, source.loot.length, ...items);
  let width = positive(source.lootWidth) ? source.lootWidth : 6;
  let height = positive(source.lootHeight) ? source.lootHeight : 4;
  width = Math.max(width, ...items.map(item => Math.max(item.w, item.h)));
  const bag = { width, height, items: source.loot };
  if (!validateBag(bag).ok) {
    const packed = createBag(width, height);
    for (const item of items) {
      let placement = findPlacement(packed, item);
      while (!placement) { packed.height++; placement = findPlacement(packed, item); }
      packed.items.push({ ...item, ...placement });
    }
    bag.height = packed.height;
    source.loot.splice(0, source.loot.length, ...packed.items);
  }
  source.lootWidth = bag.width; source.lootHeight = bag.height;
  return bag;
}

/** Atomic two-container move. Failed placement leaves both arrays and all identities unchanged. */
export function transferItem(fromBag, toBag, uid, placement) {
  if (!validateBag(fromBag).ok || !validateBag(toBag).ok) return failure('invalid_bag');
  const item = fromBag.items.find(entry => entry.uid === uid);
  if (!item) return failure('item_not_found');
  if (fromBag === toBag || fromBag.items === toBag.items) {
    return placement ? moveItem(fromBag, uid, placement.x, placement.y, placement.rotated ?? item.rotated) : { ok: true, uid };
  }
  if (toBag.items.some(entry => entry.uid === uid)) return failure('duplicate_uid');
  const target = placement ? { x: placement.x, y: placement.y, rotated: placement.rotated ?? item.rotated } : findPlacement(toBag, item);
  if (!target) return failure('no_space');
  if (!canPlace(toBag, item, target.x, target.y, target.rotated, null)) return failure('invalid_placement');
  const moved = { ...structuredClone(item), ...target };
  fromBag.items.splice(fromBag.items.indexOf(item), 1);
  toBag.items.push(moved);
  return { ok: true, uid, item: structuredClone(moved) };
}

/** Visible array order, row-major placement (unrotated then rotated), one result per attempt. */
export function lootAll(fromBag, toBag) {
  const results = [], moved = [];
  for (const item of bagItems(fromBag)) {
    const result = transferItem(fromBag, toBag, item.uid);
    results.push({ uid: item.uid, id: item.id, ok: result.ok, reason: result.reason });
    if (result.ok) moved.push(result.item ?? item);
  }
  return { ok: results.every(result => result.ok), moved, remaining: bagItems(fromBag), results };
}
