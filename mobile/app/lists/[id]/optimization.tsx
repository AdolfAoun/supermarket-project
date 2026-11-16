import { Button } from '../../../components/Design';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AccountPage, AuthGate } from '../../../components/AccountUI';
import { useAuth } from '../../../components/AuthProvider';
import { OptimizationResults } from '../../../components/OptimizationResults';
import { PageHeader, ResourceNotice, ui } from '../../../components/CatalogUI';
import { useRemote } from '../../../hooks/useRemote';
import { parseProductId } from '../../../services/api';
import { colors } from '../../../components/Design';

function Optimize({ id }: { id: number }) {
  const { state, lists } = useAuth();
  const [maximum, setMaximum] = useState(2);
  // Reload on every focus, list/account change and control change. No cached
  // previous result is presented during a new request or after a failure.
  const resource = useRemote(`optimization:${state.version}:${id}:${maximum}`, signal => lists.optimize(id, maximum, signal), () => false);
  return <AccountPage>
    <View style={ui.card}>
    <Text style={ui.heading}>Maximum branches: {maximum}</Text>
    <View style={[ui.row, { flexWrap: 'wrap', backgroundColor: colors.secondary, padding: 4, borderRadius: 16, gap: 4 }]}>{[1, 2, 3].map(n => <View key={n} style={{ flex: 1, minWidth: 60 }}><Button title={String(n)} accessibilityLabel={n === 1 ? 'One branch' : `Up to ${n} branches`}
      selected={maximum === n} disabled={maximum === n} onPress={() => setMaximum(n)} /></View>)}</View>
    <Text style={ui.muted}>The result may use fewer branches. Equal costs prefer fewer visits.</Text>
    </View>
    <ResourceNotice state={resource} retry={resource.retry} />
    <View style={[ui.row, { flexWrap: 'wrap' }]}><Button title="Refresh optimization" onPress={resource.retry} />
    <Button title="Edit shopping list" onPress={() => router.navigate({ pathname: '/lists/[id]', params: { id: String(id) } })} /></View>
    {resource.data && <OptimizationResults result={resource.data} />}
  </AccountPage>;
}
export default function OptimizationScreen() {
  const { id: raw } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = parseProductId(raw);
  return <><PageHeader title="Find cheapest basket" fallback="/(tabs)/shopping-list" /><AuthGate>
    {id === null ? <AccountPage><Text style={ui.text}>Invalid shopping-list link.</Text></AccountPage> : <Optimize key={id} id={id} />}
  </AuthGate></>;
}
