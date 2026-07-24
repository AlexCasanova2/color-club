import AsyncStorage from '@react-native-async-storage/async-storage';

const cachePrefix = 'color-club:read-cache:v1:';
const listeners = new Set<() => void>();
const cachedFallbackListeners = new Set<() => void>();

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('La conexión está tardando demasiado.')), milliseconds);
    promise.then((value) => {
      clearTimeout(timeout);
      resolve(value);
    }, (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function retryRead<T>(request: () => Promise<T>, attempts = 2, timeout = 8_000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await withTimeout(request(), timeout);
    } catch (caught) {
      lastError = caught;
      if (attempt < attempts - 1) await wait(500 * 2 ** attempt + Math.random() * 250);
    }
  }
  throw lastError;
}

export async function resilientRead<T>(key: string, request: () => Promise<T>): Promise<T> {
  const storageKey = `${cachePrefix}${key}`;
  const cached = await AsyncStorage.getItem(storageKey).catch(() => null);
  let cachedData: T | undefined;
  if (cached) {
    try { cachedData = (JSON.parse(cached) as { data: T }).data; }
    catch { await AsyncStorage.removeItem(storageKey).catch(() => undefined); }
  }
  try {
    const data = await retryRead(request, cachedData === undefined ? 2 : 1, cachedData === undefined ? 8_000 : 4_000);
    void AsyncStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), data })).catch(() => undefined);
    return data;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '';
    const isConnectivityFailure = /network|fetch|socket|timeout|timed out|conexión|connection/i.test(message);
    if (isConnectivityFailure) {
      if (cachedData !== undefined) {
        cachedFallbackListeners.forEach((listener) => listener());
        return cachedData;
      }
      throw new Error('No hay conexión suficiente. Revisa la cobertura y vuelve a intentarlo.');
    }
    throw caught;
  }
}

export async function retryWrite<T>(request: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await withTimeout(request(), 20_000); }
    catch (caught) {
      lastError = caught;
      if (attempt < attempts - 1) await wait(700 * 2 ** attempt + Math.random() * 300);
    }
  }
  throw lastError;
}

export function subscribeToResync(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function requestResync() {
  listeners.forEach((listener) => listener());
}

export function subscribeToCachedFallback(listener: () => void) {
  cachedFallbackListeners.add(listener);
  return () => { cachedFallbackListeners.delete(listener); };
}

export async function clearReadCache() {
  const keys = await AsyncStorage.getAllKeys();
  const cachedKeys = keys.filter((key) => key.startsWith(cachePrefix) || key.startsWith('collage-draft:'));
  if (cachedKeys.length) await AsyncStorage.multiRemove(cachedKeys);
}
