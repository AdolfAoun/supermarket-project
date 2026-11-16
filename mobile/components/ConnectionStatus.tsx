import { Button } from './Design';
import { StyleSheet, Text, View } from 'react-native';
import { useRemote } from '../hooks/useRemote';
import { catalogApi } from '../services/api';
import { colors, Icon } from './Design';

export function ConnectionStatus() {
  const connection = useRemote('health', signal => catalogApi.health(signal), () => false);
  return <View style={styles.card}>
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Icon name={connection.status === 'loaded' ? 'checkmark-circle-outline' : 'cloud-outline'} size={18} />
    <Text accessibilityLiveRegion="polite" style={[styles.status, { flex: 1 }]}>
      {connection.status === 'loaded' ? 'Backend and database connected'
        : connection.status === 'error' ? `Connection failed: ${connection.error}` : 'Checking connection'}
    </Text></View>
    {connection.status === 'error' && <Button title="Retry connection" color="#163e32" onPress={connection.retry} />}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 16, backgroundColor: colors.secondary },
  status: { fontSize: 13, lineHeight: 20, color: colors.muted },
});
