import { Button } from '../../../components/Design';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AccountPage, AuthGate } from '../../../components/AccountUI';
import { useAuth } from '../../../components/AuthProvider';
import { BasketResults } from '../../../components/BasketResults';
import { PageHeader, ResourceNotice, ui } from '../../../components/CatalogUI';
import { useRemote } from '../../../hooks/useRemote';
import { parseProductId } from '../../../services/api';

function Compare({ id }: { id: number }) {
  const { state, lists } = useAuth();
  const resource = useRemote(`basket:${state.version}:${id}`, signal => lists.compare(id, signal), () => false);
  return <AccountPage>
    <ResourceNotice state={resource} retry={resource.retry} />
    <Button title="Reload comparison" onPress={resource.retry} />
    <Button title="Edit shopping list" onPress={() => router.replace({ pathname: '/lists/[id]', params: { id: String(id) } })} />
    {resource.data && <BasketResults comparison={resource.data} />}
  </AccountPage>;
}
export default function BasketComparisonScreen() {
  const { id: raw } = useLocalSearchParams<{ id?: string | string[] }>(); const id = parseProductId(raw);
  return <><PageHeader title="Compare basket" fallback="/(tabs)/shopping-list" /><AuthGate>
    {id === null ? <AccountPage><Text style={ui.text}>Invalid shopping-list link.</Text></AccountPage> : <Compare id={id} />}
  </AuthGate></>;
}
