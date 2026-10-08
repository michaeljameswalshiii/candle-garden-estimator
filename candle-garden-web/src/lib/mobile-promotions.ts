import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { listCustomerOrders } from "@/lib/mobileadmin/data";
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:"us-east-1"}));
const table="candle-garden-detect-rate-limits";
export function promotionDiscount(coupon:any,subtotal:number) {
  if(coupon.currency && coupon.currency!=="usd")throw new Error("This promotion is not valid for USD orders.");
  const discount=coupon.percent_off!=null?Math.round(subtotal*Number(coupon.percent_off)/100):Number(coupon.amount_off||0);
  if(!Number.isFinite(discount)||discount<=0)throw new Error("This promotion has no applicable discount.");
  return Math.min(subtotal,Math.max(0,discount));
}
export async function applyPromotion(key:string,code:string,subtotal:number,customer:string) {
  if(!code.trim())return {amount:subtotal,discount:0,code:"",reservation:""};
  if(code.length>80)throw new Error("Promo codes must be 80 characters or fewer.");
  const params=new URLSearchParams({code:code.trim(),active:"true",limit:"1"});
  const headers={Authorization:`Bearer ${key}`,"Stripe-Version":"2024-06-20"};
  const response=await fetch(`https://api.stripe.com/v1/promotion_codes?${params}`,{headers,cache:"no-store",signal:AbortSignal.timeout(10000)});
  const payload=await response.json();const promotion=payload.data?.[0];
  if(!response.ok||!promotion?.active)throw new Error("That promo code is invalid or no longer active.");
  let coupon=promotion.coupon||promotion.promotion?.coupon;
  if(typeof coupon==="string"){const r=await fetch(`https://api.stripe.com/v1/coupons/${encodeURIComponent(coupon)}`,{headers,cache:"no-store"});if(!r.ok)throw new Error("Could not verify the promotion.");coupon=await r.json();}
  if(!coupon?.valid || (promotion.expires_at && promotion.expires_at<=Date.now()/1000))throw new Error("That promo code has expired.");
  if(promotion.customer || coupon.applies_to?.products?.length)throw new Error("This promotion is restricted and cannot be applied to this app cart.");
  const restrictions=promotion.restrictions||{};
  if(restrictions.minimum_amount_currency && restrictions.minimum_amount_currency!=="usd")throw new Error("That promo code uses another currency.");
  if(subtotal<Number(restrictions.minimum_amount||0))throw new Error("Your cart does not meet the minimum for that promo code.");
  if(restrictions.first_time_transaction && (await listCustomerOrders(customer)).some(order=>["paid","paid_test","processing","completed","shipped"].includes(order.status||"")))throw new Error("That promo code is for first-time customers.");
  const discount=promotionDiscount(coupon,subtotal);
  let reservation="";
  if(promotion.max_redemptions!=null){
    const remaining=Number(promotion.max_redemptions)-Number(promotion.times_redeemed||0);
    if(remaining<=0)throw new Error("That promo code has reached its usage limit.");
    reservation=`mobile-promo:${promotion.id}`;
    try{await db.send(new UpdateCommand({TableName:table,Key:{pk:reservation},UpdateExpression:"ADD #uses :one",ConditionExpression:"attribute_not_exists(#uses) OR #uses < :limit",ExpressionAttributeNames:{"#uses":"uses"},ExpressionAttributeValues:{":one":1,":limit":remaining}}));}
    catch{throw new Error("That promo code has reached its usage limit.");}
  }
  return {amount:subtotal-discount,discount,code:String(promotion.code),reservation};
}
export async function releasePromotion(reservation:string) {
  if(!reservation)return;
  await db.send(new UpdateCommand({TableName:table,Key:{pk:reservation},UpdateExpression:"ADD #uses :minus",ConditionExpression:"#uses > :zero",ExpressionAttributeNames:{"#uses":"uses"},ExpressionAttributeValues:{":minus":-1,":zero":0}}));
}
