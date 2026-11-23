import { useEffect, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { useAuth } from './AuthProvider';
import { Badge, Button, Disclosure } from './Design';
import { inputStyle, ErrorText } from './AccountUI';
import { ResourceNotice, ui } from './CatalogUI';
import { RouteDiscovery } from './RouteDiscovery';
import { useRemote } from '../hooks/useRemote';
import { discoveryRequest } from '../services/discovery';
import type { JourneyDraft } from '../services/journey';
import { fuelNavigation, validFuel, type FuelRequest, type FuelSettings } from '../services/fuel';
import { fuelPreferences } from '../services/fuel-storage';
import { packageLabel, observedLabel } from '../services/presentation';

function Results({ id, input }: { id: number; input: FuelRequest }) {
  const { lists, state } = useAuth();
  const resource = useRemote(`fuel:${state.version}:${id}:${JSON.stringify(input)}`, signal => lists.optimizeFuel(id, input, signal), () => false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const result = resource.data;
  const names = new Map(result?.shoppingList.items.map(i => [i.productId, `${i.product.name} (${packageLabel(i.product)})`]));
  return <View testID="fuel-results" style={ui.section}>
    <ResourceNotice state={resource} retry={resource.retry} />
    {resource.status === 'loading' && <Text style={ui.text}>Calculating shopping routes and fuel. This may take up to a minute.</Text>}
    {result && <>
      <Badge tone="warning">DEMONSTRATION PRICES · ESTIMATED FUEL</Badge>
      <Text style={ui.text}>Best among evaluated plans. Up to three nearby price-bearing branches in a 3 km corridor are considered; this is not an exhaustive supermarket search.</Text>
      {!result.evaluationComplete && <Text accessibilityRole="alert" style={ui.text}>Comparison is incomplete: some locations, visit orders or routes could not be evaluated. Retry or review the limitations below.</Text>}
      {!!result.excludedItems.length && <Text style={ui.text}>Inactive products excluded: {result.excludedItems.map(i => i.product.name).join(', ')}. Totals cover active items only.</Text>}
      <Text style={ui.muted}>{result.distancePolicy === 'full_shopping_route' ? 'Matching endpoints: fuel covers the complete shopping route, returning to your starting point.'
        : 'Fuel covers only max(0, shopping route distance minus the original journey distance). Original stops keep their order.'}</Text>
      {!result.plans.length && <Text style={ui.heading}>Fuel-inclusive comparison unavailable. No complete basket with a usable route was found within the evaluated scope and driving allowance. Missing distances are not zero-cost routes.</Text>}
      {result.plans.map((plan, index) => <View key={plan.grocery.branchIds.join(',')} style={[ui.card, index === 0 && ui.featured]}>
        <Text style={ui.heading}>{index === 0 ? 'Lowest evaluated total' : 'Evaluated alternative'} · {plan.grocery.branchIds.length} {plan.grocery.branchIds.length === 1 ? 'branch' : 'branches'}</Text>
        <Text style={ui.text}>Groceries: USD {plan.grocery.totalUsd}</Text>
        <Text style={ui.text}>Estimated fuel: USD {plan.fuelUsd}</Text>
        <Text style={ui.price}>Total trip: USD {plan.totalUsd}</Text>
        <Text style={ui.muted}>Whole route: {(plan.routeDistanceMeters / 1000).toFixed(2)} km · Fuel charged for: {(plan.chargedDistanceMeters / 1000).toFixed(2)} km · {plan.fuelLiters} L</Text>
        <Text style={ui.text}>Visit order: {plan.visitOrder.map(id => {
          const b = plan.grocery.allocations.find(b => b.branchId === id)!; return `${b.supermarket} · ${b.branch}`;
        }).join(' → ')}</Text>
        <Disclosure title="Products and price freshness">
          {plan.grocery.allocations.map(b => <View key={b.branchId} style={ui.section}>
            <Text style={ui.heading}>{b.supermarket} · {b.branch} · USD {b.subtotalUsd}</Text>
            {b.items.map(i => <Text key={i.productId} style={ui.text}>{names.get(i.productId)} × {i.quantity}: USD {i.lineTotalUsd}. {i.freshness === 'older' ? 'Older price; check shelf price.' : i.freshness === 'future' ? 'Future-dated observation; check this price.' : 'Recent observation; price may have changed.'} Observed {observedLabel(i.observedAt)} · Verified demonstration observation.</Text>)}
          </View>)}
        </Disclosure>
        <Button title="Navigate this plan with Google Maps" onPress={() => {
          setNavigationError(null);
          void Linking.openURL(fuelNavigation(plan.routePoints)).catch(() => setNavigationError('Could not open Google Maps. Please retry.'));
        }} />
      </View>)}
      <ErrorText message={navigationError} />
      <Disclosure title="Comparison limits and excluded locations">
        <Text style={ui.muted}>OSRM road estimates without live traffic; Google Maps may choose another route. Up to 24 shopping routes are checked, preserving existing stop order. Fuel price is manually supplied, not a live price. Fixed conversion: 90,000 LBP = 1 USD. Exact amounts determine ranks; display rounds to cents. Check shelf prices, stock and store entrances before visiting.</Text>
        {result.excludedBranches.map(b => <Text key={b.branchId} style={ui.muted}>Branch {b.branchId}: {b.reason.replaceAll('_', ' ')}</Text>)}
        {result.routeFailures.map((f, i) => <Text key={i} style={ui.muted}>Branches {f.branchIds.join(', ')}: {f.reason.replaceAll('_', ' ')}</Text>)}
        <Text style={ui.muted}>Routing: OSRM · Map data © OpenStreetMap contributors. Original baseline: {(result.baseline.distanceMeters / 1000).toFixed(2)} km.</Text>
      </Disclosure>
      <Button title="Refresh fuel comparison" onPress={resource.retry} />
    </>}
  </View>;
}
function Calculator({ id, maximum, journey }: { id: number; maximum: number; journey: JourneyDraft }) {
  const [fuel, setFuel] = useState<FuelSettings>({ consumption: '', price: '', currency: 'USD' });
  const [minutes, setMinutes] = useState('8'), [ready, setReady] = useState(false), [storageError, setStorageError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fuelPreferences.load().then(saved => { if (active && saved) setFuel(saved); }, () => {
      if (active) setStorageError('Fuel preferences could not be restored. Enter them below.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  const valid = ready && validFuel(fuel) && /^(0|[1-9]\d?)$/.test(minutes) && Number(minutes) <= 30;
  const input: FuelRequest = { journey: { ...discoveryRequest(journey), maxDetourMinutes: Number(minutes) }, fuel, maxStores: maximum };
  const signature = JSON.stringify(input);
  return <View style={ui.section}>
    <Text style={ui.heading}>Fuel settings</Text>
    <Text style={ui.text}>Consumption (L/100 km)</Text>
    <TextInput accessibilityLabel="Fuel consumption in L per 100 km" style={inputStyle} value={fuel.consumption} editable={ready}
      keyboardType="decimal-pad" maxLength={6} onChangeText={consumption => setFuel({ ...fuel, consumption })} />
    <Text style={ui.text}>Fuel price per liter ({fuel.currency})</Text>
    <TextInput accessibilityLabel="Fuel price per liter" style={inputStyle} value={fuel.price} editable={ready}
      keyboardType="decimal-pad" maxLength={13} onChangeText={price => setFuel({ ...fuel, price })} />
    <View style={ui.row}>{(['USD', 'LBP'] as const).map(currency => <Button key={currency} title={currency} selected={fuel.currency === currency} disabled={!ready || fuel.currency === currency}
      onPress={() => setFuel({ ...fuel, currency })} />)}</View>
    <Text style={ui.muted}>Consumption must be above 0 through 100. Use at most two decimal places. Currency changes do not convert your entered price; enter the price in the selected currency. A price of zero explicitly assumes free fuel.</Text>
    <Text style={ui.text}>Maximum driving allowance (0–30 minutes; additional time, or full time for matching endpoints)</Text>
    <TextInput accessibilityLabel="Maximum fuel trip driving allowance" style={inputStyle} value={minutes} keyboardType="number-pad" maxLength={2} onChangeText={setMinutes} />
    <Text style={ui.muted}>Fuel settings are remembered on this device (browser: until reload). Journey coordinates are not saved. Settings are sent to the backend, and route coordinates to OSRM.</Text>
    <ErrorText message={storageError} />
    <Button title="Calculate groceries and fuel" variant="primary" disabled={!valid} onPress={() => {
      setStorageError(null);
      void fuelPreferences.save(fuel).catch(() => setStorageError('Comparison can continue, but these fuel settings could not be saved.'));
      setSubmitted(signature);
    }} />
    {submitted === signature && <Results key={signature} id={id} input={input} />}
  </View>;
}
export function FuelComparison({ id, maximum }: { id: number; maximum: number }) {
  return <RouteDiscovery renderJourney={journey => <Calculator id={id} maximum={maximum} journey={journey} />} />;
}
