import { useState } from 'react';
import { Button, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ProductImage, ResourceNotice, ui } from '../../components/CatalogUI';
import { useRemote } from '../../hooks/useRemote';
import { CATALOG_LIMIT, catalogApi, SEARCH_LIMIT } from '../../services/api';
import { packageLabel, productRoute } from '../../services/presentation';

export default function Explore() {
  const [input, setInput] = useState('');
  const search = input.trim();
  const resource = useRemote(`products:${search}`, signal => catalogApi.products(search, signal), products => products.length === 0, search ? 350 : 0);
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    <View style={styles.search}>
      <Text style={ui.heading}>Browse products</Text>
      <TextInput accessibilityLabel="Search products" placeholder="Name, brand, category or alias"
        style={styles.input} value={input} onChangeText={setInput} maxLength={SEARCH_LIMIT}
        autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" />
      {input.length > 0 && <Button title="Clear search" color="#17634c" onPress={() => setInput('')} />}
      <Text style={ui.muted}>Search up to {SEARCH_LIMIT} characters. Package sizes remain separate.</Text>
    </View>
    <FlatList data={resource.data ?? []} keyExtractor={product => String(product.id)}
      contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled"
      refreshing={resource.status === 'refreshing'} onRefresh={resource.refresh}
      ListHeaderComponent={<ResourceNotice state={resource} retry={resource.retry} />}
      ListEmptyComponent={resource.status === 'empty' ? <Text style={ui.text}>
        {search ? 'No products match this search. Try a different name or package size.' : 'No registered products are available.'}
      </Text> : undefined}
      ListFooterComponent={resource.data?.length === CATALOG_LIMIT ? <Text style={ui.muted}>
        Showing up to {CATALOG_LIMIT} products. Narrow your search to find other products; pagination is not available.
      </Text> : undefined}
      renderItem={({ item }) => <Pressable accessibilityRole="button"
        accessibilityLabel={`${item.brand}, ${item.name}, ${item.variant}, ${packageLabel(item)}. Product details`}
        style={({ pressed }) => [ui.card, ui.row, pressed && { opacity: 0.7 }]}
        onPress={() => router.navigate(productRoute(item.id))}>
        <ProductImage product={item} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={ui.heading}>{item.name}</Text>
          <Text style={ui.text}>{item.brand}{item.variant ? ` · ${item.variant}` : ''}</Text>
          <Text style={ui.text}>{packageLabel(item)}</Text>
          <Text style={ui.muted}>{item.category} · View details ›</Text>
        </View>
      </Pressable>} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  search: { padding: 20, paddingBottom: 0, gap: 8 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#71857a', borderRadius: 8,
    padding: 12, fontSize: 16, color: '#163e32' },
});
