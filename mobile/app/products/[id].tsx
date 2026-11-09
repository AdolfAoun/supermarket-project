import { Button, ScrollView, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { PageHeader, ProductIdentity, ResourceNotice, ui } from '../../components/CatalogUI';
import { useRemote } from '../../hooks/useRemote';
import { catalogApi, parseProductId } from '../../services/api';
import { priceRoute } from '../../services/presentation';

function Details({ id }: { id: number }) {
  const resource = useRemote(`product:${id}`, signal => catalogApi.product(id, signal), () => false);
  return <ScrollView testID="product-details-scroll" contentContainerStyle={ui.content}
    refreshControl={<RefreshControl refreshing={resource.status === 'refreshing'} onRefresh={resource.refresh} />}>
    <ResourceNotice state={resource} retry={resource.retry} />
    {resource.data && <>
      <ProductIdentity product={resource.data} />
      <Button title="Compare branch prices" color="#17634c" onPress={() => router.navigate(priceRoute(id))} />
      <Button title="Add to Shopping List" color="#17634c" onPress={() => router.navigate({ pathname: '/products/[id]/add', params: { id: String(id) } })} />
      <Text style={ui.muted}>Compare this exact package. A recorded price does not confirm current stock.</Text>
    </>}
  </ScrollView>;
}
export default function ProductDetails() {
  const { id: parameter } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = parseProductId(parameter);
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    <PageHeader title="Product details" />
    {id === null ? <View style={ui.content}><Text accessibilityRole="alert" style={ui.text}>Invalid product link. Return to Explore to select a registered product.</Text></View>
      : <Details id={id} />}
  </SafeAreaView>;
}
