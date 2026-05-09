import * as FileSystem from 'expo-file-system';

const CACHE_DIR = `${FileSystem.cacheDirectory}images/`;

async function ensureCacheDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

export async function getCachedImageUri(remoteUri) {
  if (!remoteUri) return null;

  try {
    await ensureCacheDir();
    const filename = remoteUri.split('/').pop().split('?')[0];
    const localUri = CACHE_DIR + filename;

    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) return localUri;

    const download = await FileSystem.downloadAsync(remoteUri, localUri);
    return download.uri;
  } catch {
    return remoteUri; // fallback to remote
  }
}

export async function clearImageCache() {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  } catch {}
}
