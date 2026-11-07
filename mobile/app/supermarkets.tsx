import { SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader, ResourceNotice, ui } from '../components/CatalogUI';
import { useRemote } from '../hooks/useRemote';
import { catalogApi } from '../services/api';

export default function Supermarkets() {
  const resource = useRemote('supermarkets', signal => catalogApi.supermarkets(signal), rows => rows.length === 0);
  const sections = (resource.data ?? []).map(chain => ({ id: chain.id, title: chain.name, data: chain.branches }));
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    <PageHeader title="Supermarkets and branches" fallback="/(tabs)" />
    <SectionList testID="supermarket-list" sections={sections} keyExtractor={branch => String(branch.id)} stickySectionHeadersEnabled={false}
      contentContainerStyle={ui.content} refreshing={resource.status === 'refreshing'} onRefresh={resource.refresh}
      ListHeaderComponent={<>
        <Text testID="supermarket-intro" style={ui.muted}>Branches belong to their named chain. Store information does not confirm stock availability.</Text>
        <ResourceNotice state={resource} retry={resource.retry} />
      </>}
      ListEmptyComponent={resource.status === 'empty' ? <Text style={ui.text}>No supermarkets are registered.</Text> : undefined}
      renderSectionHeader={({ section }) => <View style={{ gap: 8, marginVertical: 12 }}>
        <Text accessibilityRole="header" style={ui.heading}>{section.title}</Text>
        {section.data.length === 0 && <Text style={ui.text}>No branches are registered for this chain.</Text>}
      </View>}
      renderItem={({ item }) => <View style={ui.card}>
        <Text style={ui.heading}>{item.name}</Text>
        <Text style={ui.text}>{item.address ?? 'Address unavailable'}</Text>
        <Text style={ui.muted}>{item.latitude === null || item.longitude === null
          ? 'Coordinates unavailable' : `Coordinates: ${item.latitude}, ${item.longitude}`}</Text>
      </View>} />
  </SafeAreaView>;
}
