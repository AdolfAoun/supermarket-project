import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { colors } from '../../components/Design';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const screens: { name: string; title: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline' },
  { name: 'explore', title: 'Explore', icon: 'search-outline' },
  { name: 'shopping-list', title: 'Shopping List', icon: 'list-outline' },
  { name: 'receipts', title: 'Receipts', icon: 'receipt-outline' },
  { name: 'profile', title: 'Profile', icon: 'person-outline' },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.tertiary,
    tabBarStyle: { backgroundColor: 'rgba(255,255,255,0.97)', borderTopColor: colors.border, elevation: 0,
      height: 64 + insets.bottom, paddingTop: 4, paddingBottom: insets.bottom + 4 },
    tabBarItemStyle: { paddingVertical: 2 }, tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
    headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.ink, headerShadowVisible: false,
    headerTransparent: false, headerTitleStyle: { fontWeight: '600', fontSize: 17 } }}>
    {screens.map(({ name, title, icon }) => <Tabs.Screen key={name} name={name} options={{ title,
      tabBarIcon: ({ color, size }) => <Ionicons name={icon} style={{ color }} size={size} />,
    }} />)}
  </Tabs>;
}
