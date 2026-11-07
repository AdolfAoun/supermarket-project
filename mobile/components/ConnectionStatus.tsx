import { Button, StyleSheet, Text, View } from 'react-native';
import { useRemote } from '../hooks/useRemote';
import { catalogApi } from '../services/api';

export function ConnectionStatus() {
  const connection = useRemote('health', signal => catalogApi.health(signal), () => false);
  return <View style={styles.card}>
    <Text accessibilityLiveRegion="polite" style={styles.status}>
      {connection.status === 'loaded' ? 'Backend and database connected'
        : connection.status === 'error' ? `Connection failed: ${connection.error}` : 'Checking connection'}
    </Text>
    {connection.status === 'error' && <Button title="Retry connection" color="#163e32" onPress={connection.retry} />}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 12, backgroundColor: '#ffffff' },
  status: { fontSize: 16, lineHeight: 24, color: '#163e32' },
});
