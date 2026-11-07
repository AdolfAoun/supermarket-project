import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  // SDK 58 can use transparent iOS headers. Let the native stack reserve header
  // space instead of making each screen add a second safe-area/header offset.
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, headerTransparent: false }} /></>;
}
