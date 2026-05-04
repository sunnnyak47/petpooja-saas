import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo Go compatible storage — MMKV requires native build (APK/dev client)
export const Storage = {
  getString: async (key) => AsyncStorage.getItem(key),
  set: async (key, value) => AsyncStorage.setItem(key, value),
  delete: async (key) => AsyncStorage.removeItem(key),
  contains: async (key) => (await AsyncStorage.getItem(key)) !== null,
};
