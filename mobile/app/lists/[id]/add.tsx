import { memo, useCallback, useState } from 'react';
import { Button, FlatList, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { AuthGate, AccountPage, ConfirmationNotice, ErrorText, inputStyle } from '../../../components/AccountUI';
import { useAuth } from '../../../components/AuthProvider';
import { PageHeader, ResourceNotice, ui } from '../../../components/CatalogUI';
import { useRemote } from '../../../hooks/useRemote';
import { useProductActions } from '../../../hooks/useProductActions';
import { useConfirmation } from '../../../hooks/useConfirmation';
import { catalogApi, CATALOG_LIMIT, parseProductId, SEARCH_LIMIT } from '../../../services/api';
import { validQuantity } from '../../../services/account-api';
import { packageLabel } from '../../../services/presentation';
import { confirmItem } from '../../../services/list-state';
import type { Product } from '../../../services/contracts';

const ProductDescription = memo(function ProductDescription({ product }: { product: Product }) {
  return <><Text style={ui.heading}>{product.name}</Text><Text style={ui.text}>{product.brand} · {product.variant} · {packageLabel(product)}</Text></>;
});
const ProductRow = memo(function ProductRow({ product, savedQuantity, pending, error, canAdd, onAdd }: {
  product: Product; savedQuantity?: number; pending: boolean; error: string | null; canAdd: boolean; onAdd: (product: Product) => void;
}) {
  return <View style={ui.card}>
    <ProductDescription product={product} />
    {savedQuantity !== undefined && <Text style={ui.muted}>Saved in this list: {savedQuantity} packages</Text>}
    <ErrorText message={error} />
    <Button title={`Add ${product.name}`} accessibilityLabel={`Add ${product.brand} ${product.name}, ${product.variant}, ${packageLabel(product)}`}
      disabled={pending || !canAdd} onPress={() => onAdd(product)} />
  </View>;
});

function Picker({ id }: { id: number }) {
  const { lists, state } = useAuth(), action = useProductActions(), confirmation = useConfirmation();
  const [search, setSearch] = useState(''), [value, setValue] = useState('1');
  const quantity = validQuantity(value), trimmed = search.trim();
  const detail = useRemote(`picker-list:${state.version}:${id}`, signal => lists.detail(id, signal), () => false, 0, { preserveData: true });
  const catalog = useRemote(`picker:${trimmed}`, signal => catalogApi.products(trimmed, signal), rows => !rows.length, trimmed ? 350 : 0);
  const listName = detail.data?.name, { update } = detail, { run } = action, { clear, show } = confirmation;
  const add = useCallback((product: Product) => {
    if (quantity !== null && listName) void run(String(product.id), signal => {
      clear(); update(current => current); return lists.add(id, product.id, quantity, signal);
    }, saved => { update(current => confirmItem(current, saved)); show(product.name, listName); });
  }, [quantity, listName, run, clear, update, lists, id, show]);
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    <FlatList keyboardShouldPersistTaps="handled" data={catalog.data ?? []} keyExtractor={p => String(p.id)} contentContainerStyle={ui.content}
      ListHeaderComponent={<>
        <Text style={ui.title}>Add registered products</Text><ResourceNotice state={detail} retry={detail.retry} />
        <Text style={ui.text}>{detail.data ? `Adding to ${detail.data.name}` : ''}</Text>
        <TextInput accessibilityLabel="Search products to add" placeholder="Name, brand, category or alias" style={inputStyle} value={search} onChangeText={setSearch} maxLength={SEARCH_LIMIT} autoCorrect={false} />
        <Text style={ui.text}>Packages to add (1–999)</Text>
        <TextInput accessibilityLabel="Quantity to add" style={inputStyle} value={value} onChangeText={setValue} maxLength={3} keyboardType="number-pad" />
        <Text style={ui.muted}>Adding an existing product increases its saved quantity. Use the list editor to replace a quantity.</Text>
        <ResourceNotice state={catalog} retry={catalog.retry} />
      </>}
      ListEmptyComponent={catalog.status === 'empty' ? <Text style={ui.text}>No registered products match this search.</Text> : undefined}
      ListFooterComponent={catalog.data?.length === CATALOG_LIMIT ? <Text style={ui.muted}>Showing up to {CATALOG_LIMIT} products. Narrow your search.</Text> : undefined}
      renderItem={({ item }) => <ProductRow product={item}
        savedQuantity={detail.data?.items.find(saved => saved.productId === item.id)?.quantity}
        pending={!!action.state[String(item.id)]?.pending} error={action.state[String(item.id)]?.error ?? null}
        canAdd={quantity !== null && !!detail.data} onAdd={add} />} />
    <ConfirmationNotice message={confirmation.message} />
  </SafeAreaView>;
}
export default function AddProducts() {
  const { id: raw } = useLocalSearchParams<{ id?: string | string[] }>(); const id = parseProductId(raw);
  return <><PageHeader title="Add products" fallback="/(tabs)/shopping-list" /><AuthGate>
    {id === null ? <AccountPage><Text style={ui.text}>Invalid shopping-list link.</Text></AccountPage> : <Picker id={id} />}
  </AuthGate></>;
}
