import * as AppleAuthentication from 'expo-apple-authentication';
import { apiFetch } from './apiClient';
export const appleSignInAvailable=()=>AppleAuthentication.isAvailableAsync();
export async function appleSignIn() {
  const {nonce}=await apiFetch('/auth/apple',{method:'POST',body:{action:'nonce'}});
  const credential=await AppleAuthentication.signInAsync({nonce,requestedScopes:[AppleAuthentication.AppleAuthenticationScope.EMAIL,AppleAuthentication.AppleAuthenticationScope.FULL_NAME]});
  const name=[credential.fullName?.givenName,credential.fullName?.familyName].filter(Boolean).join(' ');
  return apiFetch('/auth/apple',{method:'POST',body:{action:'session',identityToken:credential.identityToken,nonce,name}});
}
export { AppleAuthentication };
