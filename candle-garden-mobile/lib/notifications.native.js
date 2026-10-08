import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { registerPushToken,unregisterPushToken } from './apiClient';
const TOKEN_KEY='cg_expo_push_token_v1';
export const pushAvailable=Device.isDevice;
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export async function getStoredPushToken(){return SecureStore.getItemAsync(TOKEN_KEY);}
export async function registerForPushNotificationsAsync({syncToServer=true}={}) {
  try {
    if(!pushAvailable)throw new Error('Push notifications require a physical device.');
    if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('orders',{name:'Candle Garden updates',importance:Notifications.AndroidImportance.DEFAULT});
    let permission=await Notifications.getPermissionsAsync();
    if(permission.status!=='granted')permission=await Notifications.requestPermissionsAsync();
    if(permission.status!=='granted')throw new Error('Notifications are not allowed. You can enable them in device settings.');
    const projectId=Constants.easConfig?.projectId||Constants.expoConfig?.extra?.eas?.projectId;
    if(!projectId)throw new Error('Notification registration is not configured.');
    const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
    if(syncToServer)await registerPushToken(token,Platform.OS);
    await SecureStore.setItemAsync(TOKEN_KEY,token);
    return {token,error:null};
  }catch(error){return {token:null,error:error.message||'Could not enable notifications.'};}
}
export async function clearPushToken({syncToServer=true}={}) {
  const token=await getStoredPushToken();
  if(syncToServer&&token)await unregisterPushToken(token);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
