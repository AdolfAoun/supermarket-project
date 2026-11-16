import { Button } from '../../components/Design';
import { memo, useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AccountPage, AuthGate, ErrorText, inputStyle, NameForm } from '../../components/AccountUI';
import { useAuth } from '../../components/AuthProvider';
import { PageHeader, ResourceNotice, ui } from '../../components/CatalogUI';
import { useRemote } from '../../hooks/useRemote';
import { useProductActions } from '../../hooks/useProductActions';
import { parseProductId } from '../../services/api';
import { validQuantity } from '../../services/account-api';
import { packageLabel } from '../../services/presentation';
import type { ListItem } from '../../services/private-contracts';
import { confirmItem, confirmRemoval, syncQuantityDraft } from '../../services/list-state';
import { ListActionButton } from '../../components/ListActionButton';
import { Badge, Disclosure, EmptyState, SectionHeader } from '../../components/Design';

const ItemDescription = memo(function ItemDescription({ name, brand, variant, packageText, isActive }: {
  name: string; brand: string; variant: string; packageText: string; isActive: boolean;
}) {
  return <>
    <Text style={ui.heading}>{name}</Text>
    <Text style={ui.text}>{brand} · {packageText} · {variant}</Text>
    {!isActive && <Text style={ui.text}>Inactive product — kept in your list. Basket comparison is blocked until it is removed.</Text>}
  </>;
});
const QuantityEditor = memo(function QuantityEditor({ item, disabled, error, save, remove }: {
  item: ListItem; disabled: boolean; error: string | null; save: (itemId: number, q: number) => void; remove: (itemId: number) => void;
}) {
  const [draft, setDraft] = useState({ confirmed: item.quantity, value: String(item.quantity) });
  const currentDraft = syncQuantityDraft(draft, item.quantity);
  // Adjust this component's draft before its children commit. An effect would
  // first commit the old input alongside the new saved quantity, then render again.
  if (currentDraft !== draft) setDraft(currentDraft);
  const value = currentDraft.value;
  const quantity = validQuantity(value);
  return <View testID={`list-item-${item.id}`} style={ui.card}>
    <ItemDescription name={item.product.name} brand={item.product.brand} variant={item.product.variant}
      packageText={packageLabel(item.product)} isActive={item.product.isActive} />
    <Badge>Saved quantity: {item.quantity} complete packages</Badge>
    <ErrorText message={error} />
    <View style={ui.row}>
      <ListActionButton title="−" accessibilityLabel={`Decrease ${item.product.name} quantity`} busy={disabled} disabled={item.quantity === 1} onPress={() => save(item.id, item.quantity - 1)} />
      <TextInput accessibilityLabel={`Quantity for ${item.product.name}`} value={value}
        onChangeText={text => setDraft({ confirmed: item.quantity, value: text })} style={[inputStyle, { flex: 1, minWidth: 0, textAlign: 'center', fontWeight: '600', fontVariant: ['tabular-nums'] }]}
        keyboardType="number-pad" maxLength={3} editable={!disabled} />
      <ListActionButton title="+" accessibilityLabel={`Increase ${item.product.name} quantity`} busy={disabled} disabled={item.quantity === 999} onPress={() => save(item.id, item.quantity + 1)} />
    </View>
    {quantity === null && <Text style={ui.muted}>Enter a whole number from 1 to 999.</Text>}
    <View style={[ui.row, { flexWrap: 'wrap' }]}><ListActionButton title="Save quantity" busy={disabled} disabled={quantity === null || quantity === item.quantity} onPress={() => quantity !== null && save(item.id, quantity)} />
    <ListActionButton title="Remove product" color="#9b332c" busy={disabled} onPress={() => remove(item.id)} /></View>
    <Text style={ui.muted}>Whole packages (1–999). Use Remove product to remove an item.</Text>
  </View>;
});
function Details({ id }: { id: number }) {
  const { lists, state } = useAuth();
  const resource = useRemote(`list:${state.version}:${id}`, signal => lists.detail(id, signal), () => false, 0, { preserveData: true });
  // Responses already contain the confirmed item. Refresh the full list only on
  // focus/manual reload, instead of repainting it after every button press.
  const action = useProductActions();
  const { run } = action, { update } = resource;
  const save = useCallback((itemId: number, quantity: number) => {
    void run(String(itemId), signal => {
      update(current => current); return lists.setQuantity(id, itemId, quantity, signal);
    }, saved => update(current => confirmItem(current, saved)));
  }, [run, update, lists, id]);
  const remove = useCallback((itemId: number) => {
    void run(String(itemId), signal => {
      update(current => current); return lists.removeItem(id, itemId, signal);
    }, () => update(current => confirmRemoval(current, itemId)));
  }, [run, update, lists, id]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = resource.data;
  return <AccountPage testID="shopping-list-scroll" nativeKeyboardInsets>
    <ResourceNotice state={resource} retry={resource.retry} /><ErrorText message={action.state.list?.error ?? null} />
    {list && <>
      <Text style={ui.title}>{list.name}</Text>
      <Badge>{list.items.length} registered {list.items.length === 1 ? 'product' : 'products'}</Badge>

      <View style={ui.card}>
      <Text style={ui.label}>PLAN YOUR BASKET</Text>
      <ListActionButton title="Find Cheapest Basket" variant="primary" busy={action.pending} disabled={!list.items.some(item => item.product.isActive)} onPress={() => router.navigate({ pathname: '/lists/[id]/optimization', params: { id: String(id) } })} />
      <ListActionButton title="Add products" busy={action.pending} onPress={() => router.navigate({ pathname: '/lists/[id]/add', params: { id: String(id) } })} />
      <ListActionButton title="Compare Basket" busy={action.pending} disabled={!list.items.length} onPress={() => router.navigate({ pathname: '/lists/[id]/compare', params: { id: String(id) } })} />
      </View>
      <SectionHeader title="In your list" />
      <Text style={ui.muted}>Quantities count complete registered packages. Different sizes remain separate products.</Text>
      {!list.items.length && <EmptyState title="No products yet" description="This shopping list is empty. Add a registered product to compare your basket." />}
      {list.items.map(item => <QuantityEditor key={item.id} item={item}
        disabled={!!action.state.list?.pending || !!action.state[String(item.id)]?.pending}
        error={action.state[String(item.id)]?.error ?? null}
        save={save} remove={remove} />)}
      <Disclosure title="List name & settings" initiallyOpen>
      <NameForm key={list.name} label="Rename list" initial={list.name} disabled={!!action.state.list?.pending} submitBusy={action.pending}
        onSubmit={name => void action.run('list', signal => {
          resource.update(current => current); return lists.rename(id, name, signal);
        }, summary => resource.update(current => ({ ...current, ...summary })))} />
      </Disclosure>
      {confirmDelete ? <View style={ui.warning}>
        <Text style={ui.text}>Delete “{list.name}” and all its items? This cannot be undone.</Text>
        <ListActionButton title="Confirm delete list" color="#9b332c" busy={action.pending} onPress={() => void action.run('list', signal => lists.remove(id, signal), () => router.replace('/(tabs)/shopping-list'))} />
        <ListActionButton title="Cancel" busy={action.pending} onPress={() => setConfirmDelete(false)} />
      </View> : <ListActionButton title="Delete list" color="#9b332c" busy={action.pending} onPress={() => setConfirmDelete(true)} />}
    </>}
    <ListActionButton title="Reload list" busy={action.pending} onPress={resource.retry} />
    <Button title="All shopping lists" onPress={() => router.navigate('/(tabs)/shopping-list')} />
  </AccountPage>;
}
export default function ShoppingListDetails() {
  const { id: raw } = useLocalSearchParams<{ id?: string | string[] }>(); const id = parseProductId(raw);
  return <><PageHeader title="Shopping list" fallback="/(tabs)/shopping-list" />
    <AuthGate>{id === null ? <AccountPage><Text style={ui.text}>Invalid shopping-list link.</Text></AccountPage> : <Details id={id} />}</AuthGate></>;
}
