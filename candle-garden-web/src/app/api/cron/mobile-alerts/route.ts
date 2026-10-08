import { NextRequest,NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { sendMobilePush } from "@/lib/mobile-push";
import { GET as productsResponse } from "@/app/api/mobile/catalog/route";
import { GET as classesResponse } from "@/app/api/mobile/classes/route";
export const maxDuration=60;
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:"us-east-1"}));
export async function GET(request:NextRequest){
  if(!process.env.CRON_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
  try {
    const [products,classes]=await Promise.all([productsResponse(),classesResponse()]);
    if(!products.ok||!classes.ok)throw new Error('Could not refresh announcements.');
    const p=await products.json(),c=await classes.json();
    const key={pk:'mobile-push:catalog-snapshot'}, table='candle-garden-detect-rate-limits';
    const previous=(await db.send(new GetCommand({TableName:table,Key:key}))).Item;
    const next={...key,products:p.products.map((row:any)=>row.id),classes:c.classes.map((row:any)=>({id:row.id,available:row.available,soldOut:row.soldOut})),updated:new Date().toISOString()};
    await db.send(new PutCommand({TableName:table,Item:next,ConditionExpression:previous?'#updated = :previous':'attribute_not_exists(pk)',...(previous?{ExpressionAttributeNames:{'#updated':'updated'},ExpressionAttributeValues:{':previous':previous.updated}}:{})}));
    if(!previous)return NextResponse.json({ok:true,baseline:true,sent:0});
    const scents=p.products.filter((row:any)=>!previous.products?.includes(row.id)&&!row.soldOut);
    const seats=c.classes.filter((row:any)=>!row.soldOut && (row.available==null||row.available>0) && (!previous.classes?.some((old:any)=>old.id===row.id)||previous.classes.some((old:any)=>old.id===row.id && (old.soldOut || old.available===0))));
    let sent=0;
    if(scents.length)sent+=await sendMobilePush('newScents','New scents at Candle Garden',`${scents[0].name}${scents.length>1?' and more':''} are ready to explore.`,{type:'new_scents'});
    if(seats.length)sent+=await sendMobilePush('classSeats','Class seats are open','See the latest candle-making classes and reserve your seat.',{type:'class_seats'});
    return NextResponse.json({ok:true,newScents:scents.length,openClasses:seats.length,accepted:sent});
  }catch{return NextResponse.json({error:'Announcement refresh failed. No catalog changes were inferred from an unavailable feed.'},{status:502});}
}
