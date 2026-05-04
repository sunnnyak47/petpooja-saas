import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({ id: 'msrm-storage' });

export const Storage = {
  getString: (key) => storage.getString(key),
  set: (key, value) => storage.set(key, value),
  delete: (key) => storage.delete(key),
  contains: (key) => storage.contains(key),
};
