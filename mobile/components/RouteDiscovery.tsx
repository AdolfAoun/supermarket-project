import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { Badge, Button, Callout, colors, Disclosure, Icon, SectionHeader } from './Design';
import { ErrorText, inputStyle } from './AccountUI';
import { ui } from './CatalogUI';
import { useAuth } from './AuthProvider';
import { useMutation } from '../hooks/useMutation';
import { useRemote } from '../hooks/useRemote';
import { currentLocation } from '../services/current-location';
import { applyJourneyImport, assignJourneyPlace, emptyJourney, readyJourney, returnToStart, usableLocation, type JourneyDraft, type JourneyLocation } from '../services/journey';
import { branchBasket, DEFAULT_DETOUR_MINUTES, discoveryRequest, driveTime, filterDetours, navigationUrl } from '../services/discovery';
import type { Optimization } from '../services/optimization-contracts';
import { observedLabel } from '../services/presentation';
import { LocationDataCredits } from './LocationDataCredits';

const pointName = (p: JourneyLocation | null, fallback: string) => p?.name ?? (usableLocation(p) ? fallback : 'Choose a location');
function JourneySummary({ journey }: { journey: JourneyDraft }) {
  return <View style={styles.route}>
    <View style={styles.routeMarks}><Icon name="ellipse-outline" size={17} /><View style={styles.routeLine} /><Icon name="location" size={19} /></View>
    <View style={{ flex: 1, gap: 18 }}><View><Text style={ui.label}>FROM</Text><Text style={ui.heading}>{pointName(journey.origin, 'Starting point from Maps')}</Text></View>
      <View><Text style={ui.label}>TO</Text><Text style={ui.heading}>{pointName(journey.destination, 'Destination from Maps')}</Text></View></View>
  </View>;
}
function RoadResults({ journey, pricing }: { journey: JourneyDraft; pricing: Optimization | null }) {
  const { state, lists } = useAuth();
  const input = discoveryRequest(journey);
  const resource = useRemote(`discovery:${state.version}:${JSON.stringify(input)}`, signal => lists.discoverSupermarkets(input, signal), () => false);
  const [minutes, setMinutes] = useState(DEFAULT_DETOUR_MINUTES);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const dedicated = returnToStart(journey);
  const result = resource.data, options = result ? filterDetours(result, minutes) : [];
  const open = (url: string) => { setNavigationError(null); void Linking.openURL(url).catch(() => setNavigationError('Could not open Google Maps. Check that your browser or Maps app is available.')); };
  return <View style={ui.section}>
    {resource.status === 'loading' && <View style={ui.notice}><ActivityIndicator color={colors.accent} />
      <Text style={ui.text}>Finding convenient supermarket stops…</Text><Text style={ui.muted}>Checking roads and detours. Your first search may take up to a minute.</Text></View>}
    {resource.error && <Callout title="Road estimates unavailable" tone="warning"><Text style={ui.text}>{resource.error}</Text><Button title="Retry road estimates" onPress={resource.retry} /></Callout>}
    {result && <>
      {!dedicated && <View style={styles.metrics}><View style={{ flex: 1 }}><Text style={ui.label}>ESTIMATED DRIVE</Text><Text style={styles.metric}>{driveTime(result.baseline.durationSeconds)}</Text></View>
        <View style={{ flex: 1 }}><Text style={ui.label}>JOURNEY DISTANCE</Text><Text style={styles.metric}>{(result.baseline.distanceMeters / 1000).toFixed(1)} km</Text></View></View>
      }
      <View style={[ui.card, ui.featured]}>
        <Text style={ui.heading}>{dedicated ? 'How long can your shopping drive be?' : 'How much extra driving is okay?'}</Text>
        <Text style={styles.detourValue}>{minutes} <Text style={styles.detourUnit}>{minutes === 1 ? 'minute' : 'minutes'}</Text></Text>
        <Slider accessibilityLabel={dedicated ? 'Maximum shopping driving time' : 'Maximum additional driving time'} accessibilityValue={{ min: 0, max: 30, now: minutes, text: `${minutes} minutes` }}
          {...(Platform.OS === 'web' ? { role: 'slider' as const, 'aria-valuemin': 0, 'aria-valuemax': 30, 'aria-valuenow': minutes, 'aria-valuetext': `${minutes} minutes` } : {})}
          style={{ width: '100%', height: 48 }} minimumValue={0} maximumValue={30} step={1} value={minutes} onValueChange={setMinutes}
          minimumTrackTintColor={colors.accent} maximumTrackTintColor="#CBD8CD" thumbTintColor={colors.accent} />
        <View style={[ui.row, { justifyContent: 'space-between' }]}><Text style={ui.muted}>{dedicated ? '0 min' : 'On the way · 0 min'}</Text><Text style={ui.muted}>30 min</Text></View>
        <Text style={ui.text}>{dedicated ? `Only show shopping trips with up to ${minutes} minutes of driving, including the return.`
          : `Only show supermarkets that add up to ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} to your journey.`}</Text>
      </View>
      <SectionHeader eyebrow={dedicated ? 'OUT AND BACK' : 'ON YOUR WAY'} title={dedicated ? 'Supermarkets for Your Shopping Trip' : 'Supermarkets Along Your Route'} detail={`${options.length} ${options.length === 1 ? 'stop fits' : 'stops fit'} your driving allowance · Sorted by driving time added`} />
      {!!pricing?.excludedItems.length && <Callout title="Some saved products are inactive" tone="warning"><Text style={ui.text}>Basket amounts cover active products only. Excluded: {pricing.excludedItems.map(i => i.product.name).join(', ')}. Review the list before shopping.</Text></Callout>}
      {!options.length && <View style={ui.card}><Icon name="compass-outline" size={30} /><Text style={ui.heading}>{!result.evaluationComplete ? 'Search coverage is incomplete' : result.options.length ? `No stops within ${minutes} minutes` : 'No usable stops found in this search'}</Text>
        <Text style={ui.text}>{result.options.length ? 'Increase your driving allowance to see more evaluated stops.' : !result.evaluationComplete ? 'Some routes could not be evaluated. Retry road estimates before concluding there are no convenient supermarkets.' : 'Registered locations may be missing coordinates, outside the 3 km corridor, unreachable, or beyond 30 minutes. This directory does not cover every supermarket.'}</Text></View>}
      {options.map(option => {
        const basket = branchBasket(option, pricing);
        return <View key={option.branchId} testID={`route-branch-${option.branchId}`} style={ui.card}>
          <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><Badge>{option.supermarket}</Badge><Badge tone="success">{dedicated ? `${driveTime(option.journeyDurationSeconds)} total drive` : `+${driveTime(option.additionalDurationSeconds)} driving`}</Badge></View>
          <Text style={ui.heading}>{option.branch}</Text><Text style={ui.muted}>{option.address}</Text>
          <Text style={ui.text}>{dedicated ? `Return-trip distance: ${(option.journeyDistanceMeters / 1000).toFixed(1)} km`
            : `${option.additionalDistanceMeters < 0 ? 'Distance change: ' : 'Additional distance: +'}${(option.additionalDistanceMeters / 1000).toFixed(1)} km`}</Text>
          <View style={styles.priceRow}><Icon name="basket-outline" size={18} /><Text style={[ui.text, { flex: 1 }]}>{basket.status === 'complete' ? `Demo ${pricing?.excludedItems.length ? 'active-item basket' : 'basket'}: USD ${basket.totalUsd}`
            : basket.status === 'partial' ? `Incomplete basket · ${basket.covered}/${basket.required} products priced`
              : basket.status === 'not_loaded' ? 'Prices unavailable · choose a list for basket comparison' : 'Prices unavailable'}</Text></View>
          {basket.status === 'complete' && <Text style={ui.muted}>Fictional demonstration observations for this branch. Shelf prices and stock are not confirmed. Travel costs are excluded.</Text>}
          {basket.status === 'complete' && <Text style={ui.muted}>Oldest observation: {observedLabel(basket.oldestObservedAt)}.
            {basket.olderPrices > 0 ? ' Includes older prices; check current shelf prices.' : ''}{basket.futurePrices > 0 ? ' Includes future-dated observations; check these prices.' : ''}</Text>}
          <Button title="Navigate with Google Maps" accessibilityLabel={`Navigate via ${option.branch}`} variant="primary" onPress={() => {
            try { open(navigationUrl(result.journey, option)); } catch { setNavigationError('This journey cannot be opened with the supported Google Maps waypoint limits.'); }
          }} />
        </View>;
      })}
      {!result.evaluationComplete && <Callout title="Some stops could not be checked" tone="warning"><Text style={ui.text}>A service error or demonstration limit prevented checking every nearby branch. These results include the stops successfully evaluated.</Text></Callout>}
      <ErrorText message={navigationError} />
      <Text style={ui.muted}>{result.attribution.label}</Text>
      <LocationDataCredits />
      <View style={[ui.row, { flexWrap: 'wrap' }]}><Button title="Routing credits" variant="quiet" onPress={() => open(result.attribution.url)} />
        <Button title="Fix the map" variant="quiet" onPress={() => open(result.attribution.fixMapUrl)} /></View>
      <Disclosure title="About these road estimates">
        <Text style={ui.muted}>Estimated: {observedLabel(result.evaluatedAt)}.</Text>
        <Text style={ui.muted}>Road-network estimates, without live traffic or time spent shopping. Google Maps may choose a different route. A nearby road does not guarantee access to a store entrance.</Text>
        <Text style={ui.muted}>Location listings may be outdated. Only registered branches near the calculated road route are checked; coverage is not exhaustive. Grocery prices are independent of route ranking.</Text>
        {!!journey.waypoints.length && <Text style={ui.muted}>Your {journey.waypoints.length} original stops keep their order. Some mobile browsers support only three intermediate stops; open the link in the Google Maps app for longer journeys.</Text>}
        <Text style={ui.muted}>Coordinates are sent to the road-routing provider. Server estimates are cached briefly in memory, never saved to your account.</Text>
        <Button title="Refresh road estimates" onPress={resource.retry} />
      </Disclosure>
    </>}
  </View>;
}
export function RouteDiscovery({ pricing = null }: { pricing?: Optimization | null }) {
  const { lists } = useAuth();
  const [journey, setJourney] = useState(emptyJourney), [editing, setEditing] = useState(true), [url, setUrl] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);
  const action = useMutation(true);
  const [pendingKind, setPendingKind] = useState<'import' | 'gps'>('import');
  const clearErrors = () => { setOpenError(null); action.clearError(); };
  useFocusEffect(useCallback(() => () => { setJourney(emptyJourney()); setEditing(true); setUrl(''); setOpenError(null); setPendingKind('import'); }, []));
  const apply = (next: JourneyDraft) => { setJourney(next); if (readyJourney(next)) setEditing(false); };
  return <View style={ui.section} testID="route-discovery">
    <View style={{ gap: 10, paddingVertical: 8 }}><Badge tone="success">MAKE THE MOST OF YOUR JOURNEY</Badge>
      <Text style={ui.title}>Find Supermarkets Along Your Route</Text><Text style={ui.text}>Discover supermarkets you can visit with only a small detour from your planned journey.</Text></View>
    {editing ? <View style={ui.card}>
      <View style={ui.row}><Icon name="navigate-outline" size={26} /><Text style={ui.heading}>Where are you already going?</Text></View>
      <Text style={ui.text}>Create a driving journey in Google Maps, tap Share, and copy its link. Paste it here to find convenient supermarket stops.</Text>
      <Button title="Open Google Maps" onPress={() => { setOpenError(null); void Linking.openURL('https://www.google.com/maps').catch(() => setOpenError('Open Google Maps from your home screen, then copy your journey link.')); }} />
      <Text style={ui.label}>PASTE JOURNEY LINK</Text>
      <TextInput accessibilityLabel="Paste Journey Link" style={inputStyle} value={url} onChangeText={value => { setUrl(value); clearErrors(); }} placeholder="https://maps.app.goo.gl/…"
        autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={8192} editable={!action.pending} />
      <Button title={action.pending && pendingKind === 'import' ? 'Importing…' : 'Import Route'} variant="primary" disabled={action.pending || !url.trim()}
        onPress={() => { clearErrors(); setPendingKind('import'); void action.run(signal => lists.importGoogleMaps(url, signal), value => apply(applyJourneyImport(journey, value))); }} />
      <Text style={ui.muted}>Journey links are processed by our server; short links contact Google. Road searches send locations to OSRM. Your journey is not saved to your account.</Text>
      <ErrorText message={openError ?? action.error} />
      {journey.place && <Callout title="This link contains one place"><Text style={ui.text}>{pointName(journey.place, 'Selected place')}</Text>
        <Button title="Use as starting point" disabled={action.pending} onPress={() => apply(assignJourneyPlace(journey, 'origin'))} />
        <Button title="Use as destination" disabled={action.pending} onPress={() => apply(assignJourneyPlace(journey, 'destination'))} /></Callout>}
      {(journey.origin || journey.destination) && <>
        <JourneySummary journey={journey} />
        {journey.waypoints.length > 8 && <Text style={ui.text}>This journey has too many existing stops for a supermarket navigation link. Import a journey with at most eight stops; no stops have been removed.</Text>}
        {(!usableLocation(journey.origin) || !usableLocation(journey.destination) || !journey.waypoints.every(usableLocation)) && <Text style={ui.muted}>This journey is incomplete. Share a link containing the missing location, or use your current location as the starting point. Names alone cannot establish a route.</Text>}
        {journey.travelMode !== 'driving' && <Callout title={journey.travelMode === 'unknown' ? 'Choose driving' : `Imported mode: ${journey.travelMode}`}>
          <Text style={ui.text}>Supermarket detours use driving estimates.</Text><Button title="Use driving" disabled={action.pending} onPress={() => apply({ ...journey, travelMode: 'driving' })} /></Callout>}
      </>}
      <Button title={action.pending && pendingKind === 'gps' ? 'Finding your location…' : 'Use my current location as start'} disabled={action.pending} onPress={() => { clearErrors(); setPendingKind('gps'); void action.run(
        signal => currentLocation(Location, Location.Accuracy.Balanced, signal), origin => apply({ ...journey, origin })); }} />
      {readyJourney(journey) && <Button title="Find supermarkets" variant="primary" disabled={action.pending || !!action.error} onPress={() => setEditing(false)} />}
    </View> : <>
      <View style={ui.card}><Text style={ui.label}>YOUR JOURNEY</Text><JourneySummary journey={journey} />
        {returnToStart(journey) && <Callout title="Return-to-start shopping trip"><Text style={ui.text}>Driving estimates include the entire trip to the supermarket and back to your starting point.</Text></Callout>}
        {!!journey.waypoints.length && <Text style={ui.muted}>{journey.waypoints.length} original {journey.waypoints.length === 1 ? 'stop' : 'stops'} preserved</Text>}
        <Button title="Change journey" onPress={() => { clearErrors(); setEditing(true); setUrl(''); }} />
        <Disclosure title="Journey locations"><Text style={ui.muted}>From: {journey.origin!.latitude}, {journey.origin!.longitude}</Text>
          <Text style={ui.muted}>To: {journey.destination!.latitude}, {journey.destination!.longitude}</Text></Disclosure>
      </View>
      <RoadResults journey={journey} pricing={pricing} />
    </>}
  </View>;
}
const styles = StyleSheet.create({
  route: { flexDirection: 'row', gap: 14, paddingVertical: 10 }, routeMarks: { alignItems: 'center', paddingVertical: 6 },
  routeLine: { width: 1, minHeight: 26, flex: 1, backgroundColor: '#B2C8B7', marginVertical: 5 },
  metrics: { flexDirection: 'row', padding: 18, gap: 12, borderRadius: 18, backgroundColor: colors.secondary },
  metric: { fontSize: 20, fontWeight: '600', color: colors.ink, marginTop: 6, fontVariant: ['tabular-nums'] },
  detourValue: { fontSize: 42, fontWeight: '700', color: colors.accent, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  detourUnit: { fontSize: 18, fontWeight: '500', letterSpacing: 0 }, priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
