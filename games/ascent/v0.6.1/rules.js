import {ITEMS,bagItems,normalizeLoot,transferItem,dimensions} from './inventory.js?build=0.6.1';
import {SETTINGS} from './config.js?build=0.6.1';
export function activeExitAt(floor,time,schedule=null){
 if(!Number.isInteger(floor)||floor<4||floor>8)return false;
 const entry=schedule?.exits?.find(e=>e.floor===floor);
 if(schedule&&!entry)return false;
 const close=entry?entry.closeAt:SETTINGS.exitCloseSeconds[floor-1];
 return close===null||(Number.isFinite(close)&&time<close);
}
export function migrateSave(raw={}){
 const positive=v=>Number.isSafeInteger(v)&&v>=0?v:0;
 const warehouse={};for(const id of Object.keys(ITEMS))warehouse[id]=positive(raw.warehouse?.[id]);
 if(!raw.warehouse){warehouse.a=raw.a?1:0;warehouse.b=raw.b?1:0;warehouse.scrap=positive(raw.scrap);warehouse.med=raw.medkits===undefined?1:positive(raw.medkits)}
 const stock=Array.isArray(raw.warehouseItems)?raw.warehouseItems:Object.entries(warehouse).filter(([,qty])=>qty>0).map(([id,qty])=>({id,qty}));
 const seen=new Set(),warehouseItems=normalizeLoot(stock.filter(item=>{if(item?.uid&&seen.has(item.uid))return false;if(item?.uid)seen.add(item.uid);return true}));
 for(const id of Object.keys(warehouse))warehouse[id]=0;for(const item of warehouseItems)warehouse[item.id]++;
 return{version:2,a:!!raw.a||warehouse.a>0,b:!!raw.b||warehouse.b>0,scrap:warehouse.scrap,medkits:warehouse.med,warehouse,warehouseItems,credits:positive(raw.credits),totalExtractedValue:positive(raw.totalExtractedValue)};
}
export function bankRun(previous,bag){
 const save=migrateSave(previous),seen=new Set(save.warehouseItems.map(i=>i.uid));
 for(const item of bagItems(bag)){
  if(item.uid&&seen.has(item.uid))continue;
  for(const good of normalizeLoot([item]))if(!seen.has(good.uid)){save.warehouseItems.push(good);seen.add(good.uid)}
 }
 return migrateSave(save);
}
// Deploy one exact stored instance. Failed placement commits neither side.
export function withdrawWarehouse(previous,bag,id='med'){
 const save=migrateSave(previous),item=save.warehouseItems.find(i=>i.id===id);
 if(!item)return{ok:false,reason:'empty',save:previous};
 const size=dimensions(item),from={width:Math.max(8,item.x+size.w),height:Math.max(6,item.y+size.h),items:[structuredClone(item)]};
 const moved=transferItem(from,bag,item.uid);if(!moved.ok)return{...moved,save:previous};
 save.warehouseItems=save.warehouseItems.filter(i=>i.uid!==item.uid);
 return{ok:true,save:migrateSave(save),item:moved.item};
}
