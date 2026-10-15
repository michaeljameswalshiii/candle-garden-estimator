import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './helpers.mjs';
const require=createRequire(import.meta.url);
const ts=require(path.join(ROOT,'candle-garden-web/node_modules/typescript'));
const packing=JSON.parse(fs.readFileSync(path.join(ROOT,'packages/catalog/refill-packing.json'),'utf8'));
function load(file,stubs) {
  const code=ts.transpile(fs.readFileSync(path.join(ROOT,'candle-garden-web/src',file),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true});
  const context={exports:{},require:id=>{assert.ok(stubs[id],`Unstubbed ${id}`);return stubs[id];},process:{env:{}},Date,AbortSignal};
  vm.runInNewContext(code,context);return context.exports;
}
const json=(data,{status=200}={})=>({ok:status===200,status,json:async()=>data});

test('physical candles from live inventory and saved carts price correctly; unavailable variants still fail',async()=>{
  const candle={id:'coffee',name:'But First, Coffee',soldOut:false,variants:[{id:'current-18',size:'18oz',price:42,soldOut:false,quantity:null}]};
  const pricing=load('lib/mobile-checkout-pricing.ts',{
    '@/app/api/mobile/catalog/route':{GET:async()=>json({products:[candle]})},
    '@/app/api/mobile/classes/route':{GET:async()=>json({classes:[]})},
    '@/lib/shippo':{candleGardenOrigin:()=>({})}, '@/lib/refill-pricing':{},
    '../../../packages/catalog/refillScents':{},
  });
  const item={type:'physical',productId:'coffee',quantity:1,variantId:'old-18',size:'18oz',unitPrice:1};
  const quote=await pricing.priceItems([item],{});
  assert.equal(quote.total,4200);assert.equal(quote.items[0].variantId,'current-18');
  candle.variants[0].soldOut=true;
  await assert.rejects(pricing.priceItems([item],{}),/available size/);
});

test('estimator quote and checkout share every shipping leg and packing charge',async()=>{
  const shippo={candleGardenOrigin:()=>({zip:'32233'}),shippoConfigured:()=>true,
    lowestRate:async(from,_to,_lb,dims)=>({cents:dims[2]===2?800:from.zip==='32233'?1700:1500,provider:'Carrier',service:'Ground',objectId:'quote'})};
  const pricing=load('lib/refill-pricing.ts',{'@/lib/shippo':shippo,'../../../packages/catalog/refill-packing.json':packing});
  const route=load('app/payments/shipping-quote/route.ts',{'@/lib/shippo':shippo,'@/lib/refill-pricing':pricing,'next/server':{NextResponse:{json}}});
  const dest={address:'1 Main St',city:'Atlantic Beach',state:'FL',zip:'32250'};
  for(const speed of ['standard','expedited'])for(const boxKey of ['ups_small','ups_medium','ups_large']) {
    const body={ounces:30,quantity:1,vesselCount:4,boxKey,speed,dest};
    const response=await route.POST({json:async()=>body});const result=await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    for(const quote of result.quotes.filter(q=>q.method!=='store_dropoff')) {
      const checkout=await pricing.priceRefillShipping({...body,shippingMethod:quote.method},dest);
      assert.equal(quote.shipping_cents,checkout.shippingCents,`${speed}/${boxKey}/${quote.method}`);
      assert.equal(quote.shipping_cents,quote.legs.reduce((sum,leg)=>sum+leg.cents,0)+quote.materials_cents);
      assert.equal(quote.materials_cents,quote.method==='kit_roundtrip'?packing.materialsCents[boxKey]:0);
    }
  }
});
