import { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { getApiUrl } from '../services/api';

type Connection =
  | { status: 'checking' }
  | { status: 'connected' }
  | { status: 'failed'; message: string };

export function ConnectionStatus() {
  const [connection, setConnection] = useState<Connection>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    setConnection({ status: 'checking' });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);

    async function checkConnection() {
      try {
        const response = await fetch(`${getApiUrl()}/health/db`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(response.status === 503
            ? 'The backend responded, but the database is unavailable. Check WAMP/MySQL and the backend configuration.'
            : `The backend returned HTTP ${response.status}. Check that the API URL points to the Express /api endpoint.`);
        }
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('status' in data) || !('database' in data)
          || data.status !== 'ok' || data.database !== 'connected') {
          throw new Error('The backend returned an unexpected database health response. Check the API URL and backend.');
        }
        if (active) setConnection({ status: 'connected' });
      } catch (error) {
        if (active) {
          const message = timedOut
            ? 'The request timed out after 10 seconds. Check that Express is running and your phone can reach it on the same network.'
            : error instanceof TypeError
              ? 'Could not reach the backend. Check your network, Express server, firewall, and EXPO_PUBLIC_API_URL in mobile/.env.'
              : error instanceof SyntaxError
                ? 'The backend did not return valid JSON. Check the API URL and Express server.'
                : error instanceof Error ? error.message : 'An unexpected connection error occurred. Please retry.';
          setConnection({ status: 'failed', message });
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    void checkConnection();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  return <View style={styles.card}>
    <Text accessibilityLiveRegion="polite" style={styles.status}>
      {connection.status === 'checking' ? 'Checking connection'
        : connection.status === 'connected' ? 'Backend and database connected'
          : `Connection failed: ${connection.message}`}
    </Text>
    {connection.status === 'failed' && <Button title="Retry connection" color="#163e32" onPress={() => setAttempt(value => value + 1)} />}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 12, backgroundColor: '#ffffff' },
  status: { fontSize: 16, lineHeight: 24, color: '#163e32' },
});
