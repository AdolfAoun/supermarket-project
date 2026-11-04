// Expo inlines EXPO_PUBLIC variables into the app bundle. No credentials here.
export function getApiUrl(): string {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!value || !/^https?:\/\//.test(value)) {
    throw new Error('Set EXPO_PUBLIC_API_URL to your backend HTTP(S) URL in mobile/.env');
  }
  return value.replace(/\/+$/, '');
}
