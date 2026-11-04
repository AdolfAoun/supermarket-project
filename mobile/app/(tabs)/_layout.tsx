import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

const screens: { name: string; title: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline' },
  { name: 'explore', title: 'Explore', icon: 'search-outline' },
  { name: 'shopping-list', title: 'Shopping List', icon: 'list-outline' },
  { name: 'receipts', title: 'Receipts', icon: 'receipt-outline' },
  { name: 'profile', title: 'Profile', icon: 'person-outline' },
];

export default function TabLayout() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: '#17634c', tabBarLabelStyle: { fontSize: 10 }, headerTitleStyle: { fontWeight: '600' } }}>
    {screens.map(({ name, title, icon }) => <Tabs.Screen key={name} name={name} options={{ title,
      tabBarIcon: ({ color, size }) => <Ionicons name={icon} style={{ color }} size={size} />,
    }} />)}
  </Tabs>;
}
