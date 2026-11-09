import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AccountPage, AuthGate, ErrorText, inputStyle, NameForm } from '../../../components/AccountUI';
import { useAuth } from '../../../components/AuthProvider';
import { PageHeader, ProductIdentity, ResourceNotice, ui } from '../../../components/CatalogUI';
import { useRemote } from '../../../hooks/useRemote';
import { useProductActions } from '../../../hooks/useProductActions';
import { useConfirmation } from '../../../hooks/useConfirmation';
import { catalogApi, parseProductId } from '../../../services/api';
import { validQuantity } from '../../../services/account-api';

function ChooseList({ id }: { id: number }) {
  const { lists, state } = useAuth(), action = useProductActions(), confirmation = useConfirmation(), [value, setValue] = useState('1');
  const quantity = validQuantity(value);
  const resource = useRemote(`choose:${state.version}:${id}`, async signal => {
    const [product, shoppingLists] = await Promise.all([catalogApi.product(id, signal), lists.lists(signal)]);
    return { product, shoppingLists };
  }, () => false, 0, { preserveData: true });
  return <AccountPage confirmation={confirmation.message}>
    <ResourceNotice state={resource} retry={resource.retry} /><ErrorText message={action.state.list?.error ?? null} />
    {resource.data && <><ProductIdentity product={resource.data.product} />
      <Text style={ui.text}>Packages to add (1–999)</Text>
      <TextInput accessibilityLabel="Quantity to add" style={inputStyle} value={value} onChangeText={setValue} maxLength={3} keyboardType="number-pad" editable={!action.pending} />
      {!resource.data.shoppingLists.length && <Text style={ui.text}>You have no shopping lists. Create one below, then select it.</Text>}
      {resource.data.shoppingLists.map(list => <View key={list.id} style={ui.card}><Text style={ui.heading}>{list.name}</Text>
        <ErrorText message={action.state[String(list.id)]?.error ?? null} />
        <Button title={`Add to ${list.name}`} disabled={!!action.state[String(list.id)]?.pending || !!action.state.list?.pending || quantity === null} onPress={() => {
          const productName = resource.data!.product.name;
          if (quantity !== null) void action.run(String(list.id), signal => {
            confirmation.clear(); return lists.add(list.id, id, quantity, signal);
          }, () => confirmation.show(productName, list.name));
        }} />
        <Button title={`Open ${list.name}`} onPress={() => router.navigate({ pathname: '/lists/[id]', params: { id: String(list.id) } })} />
      </View>)}
      <NameForm label="Create list" disabled={action.pending} onSubmit={name => void action.run('list', signal => {
        resource.update(current => current); return lists.create(name, signal);
      }, list => resource.update(current => ({ ...current, shoppingLists: [...current.shoppingLists, list] })))} />
    </>}
  </AccountPage>;
}
export default function AddToList() {
  const { id: raw } = useLocalSearchParams<{ id?: string | string[] }>(); const id = parseProductId(raw);
  return <><PageHeader title="Add to shopping list" /><AuthGate>
    {id === null ? <AccountPage><Text style={ui.text}>Invalid product link.</Text></AccountPage> : <ChooseList id={id} />}
  </AuthGate></>;
}
