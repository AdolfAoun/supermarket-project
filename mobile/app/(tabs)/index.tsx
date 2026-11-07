import { ConnectionStatus } from '../../components/ConnectionStatus';
import { PlaceholderScreen } from '../../components/PlaceholderScreen';
import { Button } from 'react-native';
import { router } from 'expo-router';
export default function Home() {
  return <PlaceholderScreen title="Lebanon Supermarket Price Comparison" description="Welcome to your shopping companion.">
    <ConnectionStatus />
    <Button title="Browse Products" color="#17634c" onPress={() => router.navigate('/(tabs)/explore')} />
    <Button title="Browse Supermarkets" color="#17634c" onPress={() => router.navigate('/supermarkets')} />
  </PlaceholderScreen>;
}
