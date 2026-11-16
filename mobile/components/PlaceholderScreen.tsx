import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from './Design';
import { ui } from './CatalogUI';

export function PlaceholderScreen({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={ui.content}>
      <EmptyState title={title} description={description} icon="receipt-outline" />
      {children}
    </ScrollView>
  </SafeAreaView>;
}
