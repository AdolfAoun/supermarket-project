import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AccountPage, AuthGate } from '../components/AccountUI';
import { useAuth } from '../components/AuthProvider';
import { PageHeader, ResourceNotice, ui } from '../components/CatalogUI';
import { Button, Disclosure } from '../components/Design';
import { RouteDiscovery } from '../components/RouteDiscovery';
import { useRemote } from '../hooks/useRemote';
import type { Optimization } from '../services/optimization-contracts';

function SavedLists({ select }: { select: (id: number) => void }) {
  const { state, lists } = useAuth();
  const resource = useRemote(`journey-lists:${state.version}`, signal => lists.lists(signal), rows => !rows.length);
  return <View style={ui.section}>
    <ResourceNotice state={resource} retry={resource.retry} />
    {resource.status === 'empty' && <Text style={ui.muted}>You have no saved lists. You can keep exploring supermarkets.</Text>}
    {resource.data?.map(list => <Button key={list.id} title={`Compare ${list.name}`} onPress={() => select(list.id)} />)}
  </View>;
}
function OptionalPrices({ id, publish }: { id: number; publish: (value: Optimization | null) => void }) {
  const { state, lists } = useAuth();
  // Single-branch comparisons only; route exploration never runs T04 by default.
  const resource = useRemote(`journey-prices:${state.version}:${id}`, signal => lists.optimize(id, 1, signal), () => false);
  useEffect(() => { publish(resource.data); return () => publish(null); }, [resource.data, publish]);
  return <View style={ui.section}><ResourceNotice state={resource} retry={resource.retry} />
    {resource.data && <Text style={ui.muted}>Comparing saved list: {resource.data.comparison.shoppingList.name}. Missing prices never count as zero. Travel costs are excluded.</Text>}
  </View>;
}
function Journey() {
  const [selecting, setSelecting] = useState(false), [listId, setListId] = useState<number | null>(null);
  const [pricing, setPricing] = useState<Optimization | null>(null);
  return <AccountPage>
    <Disclosure title="Optional saved-list prices">
      <Text style={ui.text}>Explore locations without a list. Choose a saved list only if you also want branch basket prices.</Text>
      <Button title="Choose a saved list" onPress={() => setSelecting(value => !value)} />
      {selecting && <SavedLists select={id => { setPricing(null); setListId(id); setSelecting(false); }} />}
      {listId !== null && <><OptionalPrices key={listId} id={listId} publish={setPricing} />
        <Button title="Explore without basket prices" onPress={() => { setPricing(null); setListId(null); }} /></>}
    </Disclosure>
    <RouteDiscovery pricing={pricing} />
  </AccountPage>;
}
export default function JourneyScreen() {
  return <><PageHeader title="Supermarkets Along My Route" fallback="/(tabs)" /><AuthGate title="Discover supermarkets along your route" message="Log in to import a journey and search for convenient stops. No shopping list is required."><Journey /></AuthGate></>;
}
