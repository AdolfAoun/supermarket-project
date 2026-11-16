import { Button } from './Design';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import type { Product } from '../services/contracts';
import { packageLabel } from '../services/presentation';
import type { ResourceState } from '../services/resource';
import { Badge, colors, Icon, LoadingState } from './Design';

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: 28, lineHeight: 35, letterSpacing: -0.8, fontWeight: '700', color: colors.ink },
  heading: { fontSize: 18, lineHeight: 25, letterSpacing: -0.3, fontWeight: '600', color: colors.ink },
  text: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { fontSize: 13, lineHeight: 20, color: colors.muted },
  price: { fontSize: 34, lineHeight: 42, letterSpacing: -1, fontWeight: '700', color: colors.accent, fontVariant: ['tabular-nums'] },
  label: { fontSize: 11, lineHeight: 17, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700', color: colors.muted },
  card: { padding: 20, borderRadius: 20, backgroundColor: colors.surface, gap: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  featured: { backgroundColor: colors.accentSoft, borderColor: '#B8D1BE', borderWidth: 1 },
  section: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notice: { padding: 16, gap: 8, backgroundColor: colors.secondary, borderRadius: 16, marginBottom: 8 },
  warning: { padding: 16, gap: 6, backgroundColor: colors.warningSoft, borderRadius: 16, marginBottom: 8 },
  image: { width: 64, height: 72, borderRadius: 16, backgroundColor: colors.secondary },
});

export function PageHeader({ title, fallback = '/(tabs)/explore' }: { title: string; fallback?: '/(tabs)/explore' | '/(tabs)' | '/(tabs)/shopping-list' }) {
  return <Stack.Screen options={{ headerShown: true, title, headerLeft: () =>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} style={{ paddingRight: 12 }}
      onPress={() => router.canGoBack() ? router.back() : router.replace(fallback)}>
      <View style={[ui.row, { minHeight: 44, gap: 4 }]}><Icon name="chevron-back-outline" size={22} /><Text style={[ui.text, { color: colors.accent }]}>Back</Text></View>
    </Pressable> }} />;
}
export function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.imageUrl]);
  return product.imageUrl && !failed
    ? <Image source={{ uri: product.imageUrl }} style={ui.image} resizeMode="contain"
      accessibilityLabel={product.name} onError={() => setFailed(true)} />
    : <View style={[ui.image, { justifyContent: 'center', alignItems: 'center' }]} accessible accessibilityLabel="No product image">
      <Icon name="cube-outline" size={28} color={colors.tertiary} />
    </View>;
}
export function ProductIdentity({ product }: { product: Product }) {
  return <View testID="product-identity" style={ui.card}>
    <View style={ui.row}>
      <ProductImage product={product} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text accessibilityRole="header" style={ui.title}>{product.name}</Text>
        <Text style={ui.text}>{product.brand}{product.variant ? ` · ${product.variant}` : ''}</Text>
        <Text style={ui.heading}>{packageLabel(product)}</Text>
      </View>
    </View>
    <Badge>{product.category}</Badge>
    <Text style={ui.muted}>Pack quantity: {product.packQuantity} · Size per item: {product.size} {product.unit}</Text>
  </View>;
}
export function ResourceNotice({ state, retry }: { state: Pick<ResourceState<unknown>, 'status' | 'error'>; retry: () => void }) {
  if (state.status === 'idle' || state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <View style={ui.notice} accessibilityLiveRegion="polite">
    <View style={ui.row}><Icon name="alert-circle-outline" color={colors.error} /><Text accessibilityRole="alert" style={[ui.text, { flex: 1 }]}>{state.error}</Text></View>
    <Button title="Retry" color="#17634c" onPress={retry} />
  </View>;
  return null;
}
