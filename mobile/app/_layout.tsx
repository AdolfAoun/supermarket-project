import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../components/AuthProvider';

export default function RootLayout() {
  // SDK 58 can use transparent iOS headers. Let the native stack reserve header
  // space instead of making each screen add a second safe-area/header offset.
  return <AuthProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, headerTransparent: false }} /></AuthProvider>;
}
