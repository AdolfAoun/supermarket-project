import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { PageHeader, ProductIdentity, ResourceNotice, ui } from '../../../components/CatalogUI';
import { useRemote } from '../../../hooks/useRemote';
import { catalogApi, parseProductId } from '../../../services/api';
import { isLowestDisplayed, observedLabel } from '../../../services/presentation';
import { Disclosure, EmptyState } from '../../../components/Design';

function Prices({ id }: { id: number }) {
  const resource = useRemote(`comparison:${id}`, async signal => {
    // Direct links also fetch identity, so no screen relies on a stale nav object.
    const [product, comparison] = await Promise.all([catalogApi.product(id, signal), catalogApi.prices(id, signal)]);
    return { product, comparison };
  }, value => value.comparison.prices.length === 0);
  const comparison = resource.data?.comparison;
  return <FlatList data={comparison?.prices ?? []} keyExtractor={price => String(price.branchId)}
    contentContainerStyle={ui.content} refreshing={resource.status === 'refreshing'} onRefresh={resource.refresh}
    ListHeaderComponent={<>
      <ResourceNotice state={resource} retry={resource.retry} />
      {resource.data && <>
        <ProductIdentity product={resource.data.product} />
        <View style={comparison?.demonstrationData ? ui.warning : ui.notice}>
          <Text style={ui.heading}>{comparison?.demonstrationData ? 'Demonstration prices' : 'Price information'}</Text>
          <Text style={ui.muted}>Freshness has not been evaluated. Verified status does not mean recent.</Text>
          <Text style={ui.muted}>Availability: Check with store.</Text>
          <Disclosure title="About demonstration prices"><Text style={ui.muted}>{comparison?.dataLabel}</Text></Disclosure>
        </View>
      </>}
    </>}
    ListEmptyComponent={resource.status === 'empty' ? <EmptyState title="No recorded prices" description="No eligible price observations are available for this product. Missing prices are not zero." /> : undefined}
    renderItem={({ item }) => <View style={[ui.card, comparison && isLowestDisplayed(comparison, item) && ui.featured]}>
      {comparison && isLowestDisplayed(comparison, item) && <Text style={ui.heading}>
        {item.demonstrationData ? 'Lowest displayed demo price' : 'Lowest displayed price'}
      </Text>}
      <Text style={ui.price}>{item.currency} {item.price}</Text>
      <Text style={ui.heading}>{item.supermarket}</Text>
      <Text style={ui.text}>Branch: {item.branch}</Text>
      <Text style={ui.muted}>Observed: {observedLabel(item.observedAt)}</Text>
      <Text style={ui.muted}>{item.demonstrationData ? 'Verified (simulated demo status)' : 'Verified'} · Check with store</Text>
    </View>} />;
}
export default function PriceComparison() {
  const { id: parameter } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = parseProductId(parameter);
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    <PageHeader title="Branch price comparison" />
    {id === null ? <View style={ui.content}><Text accessibilityRole="alert" style={ui.text}>Invalid product link. Return to Explore to select a registered product.</Text></View>
      : <Prices id={id} />}
  </SafeAreaView>;
}
