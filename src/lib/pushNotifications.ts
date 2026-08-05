import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deletePushToken, savePushToken } from '@/lib/api';
import { clearLocalUserData } from '@/lib/resilience';
import { supabase } from '@/lib/supabase';

const tokenKey = (userId: string) => `color-club:push-token:${userId}`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Color Club',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const finalStatus = existing.status === 'granted' ? existing.status : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await savePushToken(data, Platform.OS);
  await AsyncStorage.setItem(tokenKey(userId), data);
}

export async function signOutCurrentDevice(userId: string) {
  const token = await AsyncStorage.getItem(tokenKey(userId));
  if (token) {
    await deletePushToken(token);
    await AsyncStorage.removeItem(tokenKey(userId));
  }
  await clearLocalUserData(userId);
  await supabase.auth.signOut({ scope: 'local' });
}

export async function clearStoredPushToken(userId: string) {
  await AsyncStorage.removeItem(tokenKey(userId));
}
