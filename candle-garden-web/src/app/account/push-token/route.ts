import { NextRequest,NextResponse } from "next/server";
import { mobileIdentity } from "@/lib/mobile-auth";
import { savePush,deletePush } from "@/lib/mobile-push";
export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
export async function POST(request:NextRequest){
  const identity=await mobileIdentity(request);if(!identity)return NextResponse.json({error:"Please sign in."},{status:401});
  try{const body=await request.json();const prefs=body.preferences||{};await savePush(identity.sub,String(body.token||""),String(body.platform||"unknown"),{orders:prefs.orders===true,newScents:prefs.newScents===true,classSeats:prefs.classSeats===true});return NextResponse.json({success:true});}catch{return NextResponse.json({error:"Could not register notifications."},{status:400});}
}
export async function DELETE(request:NextRequest){
  const identity=await mobileIdentity(request);if(!identity)return NextResponse.json({error:"Please sign in."},{status:401});
  try{const body=await request.json();await deletePush(identity.sub,String(body.token||""));return NextResponse.json({success:true});}catch{return NextResponse.json({error:"Could not disable notifications."},{status:400});}
}
