import { Button } from '../../components/Design';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ProductImage, ResourceNotice, ui } from '../../components/CatalogUI';
import { useRemote } from '../../hooks/useRemote';
import { CATALOG_LIMIT, catalogApi, SEARCH_LIMIT } from '../../services/api';
import { packageLabel, productRoute } from '../../services/presentation';
import { Badge, colors, EmptyState, Icon } from '../../components/Design';

export default function Explore() {
  const [input, setInput] = useState('');
  const search = input.trim();
  const resource = useRemote(`products:${search}`, signal => catalogApi.products(search, signal), products => products.length === 0, search ? 350 : 0);
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    <View style={styles.search}>
      <Text style={ui.label}>THE GROCERY CATALOG</Text>
      <Text style={ui.title}>Browse products</Text>
      <View style={styles.searchField}><Icon name="search-outline" size={21} />
      <TextInput accessibilityLabel="Search products" placeholder="Name, brand, category or alias"
        placeholderTextColor={colors.tertiary} style={styles.input} value={input} onChangeText={setInput} maxLength={SEARCH_LIMIT}
        autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" /></View>
      {input.length > 0 && <Button title="Clear search" variant="quiet" color={colors.accent} onPress={() => setInput('')} />}
      <Text style={ui.muted}>Search up to {SEARCH_LIMIT} characters. Package sizes remain separate.</Text>
    </View>
    <FlatList data={resource.data ?? []} keyExtractor={product => String(product.id)}
      contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled"
      refreshing={resource.status === 'refreshing'} onRefresh={resource.refresh}
      ListHeaderComponent={<ResourceNotice state={resource} retry={resource.retry} />}
      ListEmptyComponent={resource.status === 'empty' ? <EmptyState title="Nothing here yet" icon="search-outline"
        description={search ? 'No products match this search. Try a different name or package size.' : 'No registered products are available.'} /> : undefined}
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
          <Text style={ui.muted}>{item.brand}{item.variant ? ` · ${item.variant}` : ''}</Text>
          <Text style={ui.text}>{packageLabel(item)}</Text>
          <Badge>{item.category}</Badge>
        </View>
        <Icon name="chevron-forward-outline" size={18} />
      </Pressable>} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  search: { padding: 20, paddingBottom: 0, gap: 10, width: '100%', maxWidth: 760, alignSelf: 'center' },
  searchField: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 14, fontSize: 16, color: colors.ink },
});
