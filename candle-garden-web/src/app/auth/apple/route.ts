import { NextRequest, NextResponse } from "next/server";
import { appleNonce, appleSession } from "@/lib/apple-auth";
export const runtime="nodejs";
export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
export async function POST(request:NextRequest) {
  try {
    const body=await request.json();
    const device=request.headers.get("x-device-id")||"";
    if(body.action==="nonce")return NextResponse.json({nonce:await appleNonce(device)},{headers:{"Cache-Control":"no-store"}});
    if(body.action!=="session" || typeof body.identityToken!=="string" || body.identityToken.length>12000)throw new Error("Invalid sign-in request.");
    return NextResponse.json(await appleSession(body.identityToken,String(body.nonce||""),device,String(body.name||""),body.linkExisting===true),{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const name=(error as Error).name;
    console.error("apple sign-in failed", name);
    const code=(error as Error & {code?:string}).code;
    const message=code==="APPLE_LINK_REQUIRED"?(error as Error).message:name==="ConditionalCheckFailedException"?"Please wait a minute, then restart Sign in with Apple.":name==="AliasExistsException"?"That email already has an account. Sign in with your existing email and password.":"Sign in with Apple could not complete. Please try again or use email sign-in.";
    return NextResponse.json({error:message,code},{status:400});
  }
}
