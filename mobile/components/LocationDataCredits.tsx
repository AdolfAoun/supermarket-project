import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Button } from './Design';
import { ErrorText } from './AccountUI';
import { ui } from './CatalogUI';

export function LocationDataCredits() {
  const [error, setError] = useState<string | null>(null);
  return <View style={{ gap: 6 }}>
    <Text style={ui.muted}>OSM location data: © OpenStreetMap contributors, available under ODbL. Listings and store entrances may be outdated or unverified.</Text>
    <Button title="OpenStreetMap data licence" variant="quiet" onPress={() => {
      setError(null); void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => setError('Could not open the data licence. Please retry.'));
    }} />
    <ErrorText message={error} />
  </View>;
}
