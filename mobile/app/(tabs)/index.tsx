import { Pressable, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import { AccountPage } from '../../components/AccountUI';
import { ui } from '../../components/CatalogUI';
import { colors, Icon, Badge } from '../../components/Design';

export default function Home() {
  return <AccountPage>
    <View style={styles.brand}><View style={styles.brandIcon}><Icon name="basket-outline" size={27} color="#FFFFFF" /></View>
      <View style={{ flex: 1 }}><Text style={ui.label}>LEBANON SUPERMARKET</Text><Text style={ui.muted}>Your everyday shopping companion</Text></View></View>
    <View style={styles.hero}><Badge tone="success">PLAN WELL · SHOP SMART</Badge>
      <Text accessibilityRole="header" style={styles.headline}>A better basket{'\n'}starts here.</Text>
      <Text style={styles.description}>Explore grocery prices. Build your list.{'\n'}Find the best basket for you.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Browse Products" onPress={() => router.navigate('/(tabs)/explore')}
        style={({ pressed }) => [styles.heroButton, pressed && { opacity: 0.8 }]}>
        <Text style={styles.heroButtonText}>Browse Products</Text><Icon name="arrow-forward-outline" color="#FFFFFF" size={20} />
      </Pressable>
    </View>
    <Text accessibilityRole="header" style={ui.heading}>Make your next shop simpler</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Supermarkets Along My Route" onPress={() => router.navigate('/journey')}
      style={({ pressed }) => [ui.card, ui.row, pressed && { opacity: 0.8 }]}>
      <View style={styles.tile}><Icon name="navigate-outline" /></View><View style={{ flex: 1, gap: 4 }}>
        <Text style={ui.heading}>Supermarkets Along My Route</Text><Text style={ui.muted}>Find convenient stops. No shopping list needed.</Text></View><Icon name="chevron-forward-outline" size={18} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="My shopping lists" onPress={() => router.navigate('/(tabs)/shopping-list')}
      style={({ pressed }) => [ui.card, ui.row, pressed && { opacity: 0.8 }]}>
      <View style={styles.tile}><Icon name="list-outline" /></View><View style={{ flex: 1, gap: 4 }}>
        <Text style={ui.heading}>Your shopping lists</Text><Text style={ui.muted}>Plan, compare and find your cheapest basket.</Text></View><Icon name="chevron-forward-outline" size={18} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Browse Supermarkets" onPress={() => router.navigate('/supermarkets')}
      style={({ pressed }) => [ui.card, ui.row, pressed && { opacity: 0.8 }]}>
      <View style={styles.tile}><Icon name="storefront-outline" /></View><View style={{ flex: 1, gap: 4 }}>
        <Text style={ui.heading}>Browse Supermarkets</Text><Text style={ui.muted}>Explore chains and their physical branches.</Text></View><Icon name="chevron-forward-outline" size={18} />
    </Pressable>
    <ConnectionStatus />
    <Text style={ui.muted}>Product prices use demonstration observations. Location coverage is limited; check store information, stock and shelf prices before visiting.</Text>
  </AccountPage>;
}
const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  brandIcon: { backgroundColor: colors.accent, width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: '#E5EEE3', borderRadius: 28, padding: 24, gap: 20, borderWidth: 1, borderColor: '#D3E1D1' },
  headline: { fontSize: 36, lineHeight: 42, letterSpacing: -1.4, color: colors.ink, fontWeight: '700' },
  description: { fontSize: 15, lineHeight: 24, color: colors.muted },
  heroButton: { backgroundColor: colors.accent, borderRadius: 14, padding: 16, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  tile: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
});
