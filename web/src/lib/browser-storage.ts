export const API_KEY_STORAGE_PREFIX = "battleship-arena:provider-key:";

export function apiKeyStorageKey(providerId: string): string {
  return `${API_KEY_STORAGE_PREFIX}${providerId}`;
}

function readLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredApiKey(providerId: string): string {
  if (providerId.length === 0) {
    return "";
  }

  return readLocalStorage()?.getItem(apiKeyStorageKey(providerId)) ?? "";
}

export function writeStoredApiKey(providerId: string, nextApiKey: string): void {
  if (providerId.length === 0) {
    return;
  }

  const storage = readLocalStorage();
  if (storage === null) {
    return;
  }

  try {
    if (nextApiKey.length === 0) {
      storage.removeItem(apiKeyStorageKey(providerId));
      return;
    }

    storage.setItem(apiKeyStorageKey(providerId), nextApiKey);
  } catch {
    // Browser storage can be disabled or full; the form still works for the current run.
  }
}
