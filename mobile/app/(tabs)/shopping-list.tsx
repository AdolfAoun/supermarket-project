import { Button } from '../../components/Design';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { AuthGate, AccountPage, ErrorText, NameForm } from '../../components/AccountUI';
import { useAuth } from '../../components/AuthProvider';
import { ResourceNotice, ui } from '../../components/CatalogUI';
import { useRemote } from '../../hooks/useRemote';
import { useMutation } from '../../hooks/useMutation';
import { EmptyState, Icon, SectionHeader } from '../../components/Design';
import { observedLabel } from '../../services/presentation';

function Lists() {
  const { lists, state } = useAuth(), action = useMutation();
  const resource = useRemote(`lists:${state.version}`, signal => lists.lists(signal), rows => !rows.length, 0, { preserveData: true });
  return <AccountPage>
    <SectionHeader eyebrow="A LITTLE PLANNING GOES A LONG WAY" title="My shopping lists" detail="Keep your groceries together. Compare the whole basket." />
    <NameForm label="Create list" disabled={action.pending} onSubmit={name => void action.run(signal => lists.create(name, signal), list => {
      resource.update(current => [...current, list]); router.navigate({ pathname: '/lists/[id]', params: { id: String(list.id) } });
    })} />
    <ErrorText message={action.error} /><ResourceNotice state={resource} retry={resource.retry} />
    {resource.status === 'empty' && <EmptyState title="Your next shop starts here" description="No shopping lists yet. Create your first list above." />}
    {resource.data?.map(list => <View key={list.id} style={ui.card}>
      <View style={ui.row}><Icon name="list-outline" /><Text style={[ui.heading, { flex: 1 }]}>{list.name}</Text></View>
      <Text style={ui.muted}>Updated {observedLabel(list.updatedAt)}</Text>
      <Button title={`Open ${list.name}`} onPress={() => router.navigate({ pathname: '/lists/[id]', params: { id: String(list.id) } })} />
    </View>)}
    <Button title="Reload lists" disabled={action.pending} onPress={resource.retry} />
  </AccountPage>;
}
export default function ShoppingLists() { return <AuthGate><Lists /></AuthGate>; }
