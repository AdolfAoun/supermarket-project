import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import type { Product } from '../services/contracts';
import { packageLabel } from '../services/presentation';
import type { ResourceState } from '../services/resource';

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f8f7' },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: '#163e32' },
  heading: { fontSize: 19, fontWeight: '600', color: '#163e32' },
  text: { fontSize: 16, lineHeight: 24, color: '#334b42' },
  muted: { fontSize: 14, lineHeight: 21, color: '#52665c' },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#ffffff', gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notice: { padding: 16, gap: 10, backgroundColor: '#e8f1ed', borderRadius: 8, marginBottom: 12 },
  warning: { padding: 16, gap: 6, backgroundColor: '#fff2d5', borderRadius: 8, marginBottom: 12 },
  image: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#e8f1ed' },
});

export function PageHeader({ title, fallback = '/(tabs)/explore' }: { title: string; fallback?: '/(tabs)/explore' | '/(tabs)' }) {
  return <Stack.Screen options={{ headerShown: true, title, headerLeft: () =>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}
      onPress={() => router.canGoBack() ? router.back() : router.replace(fallback)}>
      <Text style={ui.text}>‹ Back</Text>
    </Pressable> }} />;
}
export function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.imageUrl]);
  return product.imageUrl && !failed
    ? <Image source={{ uri: product.imageUrl }} style={ui.image} resizeMode="contain"
      accessibilityLabel={product.name} onError={() => setFailed(true)} />
    : <View style={[ui.image, { justifyContent: 'center', alignItems: 'center' }]} accessible accessibilityLabel="No product image">
      <Text style={ui.muted}>No image</Text>
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
    <Text style={ui.text}>Category: {product.category}</Text>
    <Text style={ui.muted}>Pack quantity: {product.packQuantity} · Size per item: {product.size} {product.unit}</Text>
  </View>;
}
export function ResourceNotice({ state, retry }: { state: Pick<ResourceState<unknown>, 'status' | 'error'>; retry: () => void }) {
  if (state.status === 'idle' || state.status === 'loading') return <View style={ui.notice} accessibilityLiveRegion="polite">
    <ActivityIndicator color="#17634c" accessibilityLabel="Loading" /><Text style={ui.text}>Loading…</Text>
  </View>;
  if (state.status === 'error') return <View style={ui.notice} accessibilityLiveRegion="polite">
    <Text accessibilityRole="alert" style={ui.text}>{state.error}</Text>
    <Button title="Retry" color="#17634c" onPress={retry} />
  </View>;
  return null;
}
