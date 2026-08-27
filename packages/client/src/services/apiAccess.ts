const API_TOKEN_STORAGE_KEY = "mairie.apiToken";

export const getApiToken = (): string => localStorage.getItem(API_TOKEN_STORAGE_KEY) ?? "";

export function saveApiToken(apiToken: string): void {
  const normalizedToken = apiToken.trim();
  if (normalizedToken) localStorage.setItem(API_TOKEN_STORAGE_KEY, normalizedToken);
  else localStorage.removeItem(API_TOKEN_STORAGE_KEY);
}
