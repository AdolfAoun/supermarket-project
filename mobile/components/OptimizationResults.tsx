import { Text, View } from 'react-native';
import type { Optimization, OptimizationLine } from '../services/optimization-contracts';
import { observedLabel, packageLabel } from '../services/presentation';
import { ui } from './CatalogUI';

export function OptimizationResults({ result }: { result: Optimization }) {
  const { comparison, multiStore } = result;
  const products = new Map(comparison.shoppingList.items.map(i => [i.productId, i.product]));
  const names = (ids: number[]) => ids.map(id => {
    const p = products.get(id);
    return p ? `${p.brand} ${p.name} ${p.variant} (${packageLabel(p)})` : `Product ${id}`;
  }).join(', ');
  function lines(items: OptimizationLine[]) {
    return items.map(line => <View key={line.productId} style={ui.notice}>
      <Text style={ui.heading}>{names([line.productId])}</Text>
      <Text style={ui.text}>Quantity: {line.quantity} packages · Unit USD {line.unitPriceUsd} · Line USD {line.lineTotalUsd}</Text>
      <Text style={ui.muted}>Original unit: {line.originalCurrency} {line.originalPrice}</Text>
      <Text style={ui.muted}>Observed: {observedLabel(line.observedAt)} · Verified demonstration observation</Text>
      <Text style={ui.muted}>{line.freshness === 'older' ? `Older price (over ${result.freshnessDays} days); check current shelf price.`
        : line.freshness === 'future' ? 'Observation is future-dated; check this price.' : 'Recent observation; shelf price may have changed.'}</Text>
    </View>);
  }
  const single = comparison.eligibleBranches[0];
  return <View testID="optimization-results">
    <Text style={ui.title}>{comparison.shoppingList.name}</Text>
    <View style={ui.warning}>
      <Text style={ui.text}>{comparison.dataLabel}</Text>
      <Text style={ui.text}>Merchandise costs only. Driving and fuel expenses are excluded. Splitting the basket may cost more overall.</Text>
    </View>
    {result.excludedItems.length > 0 && <Text style={ui.text}>Inactive products excluded from this optimization: {result.excludedItems.map(i => `${i.product.name} (${packageLabel(i.product)})`).join(', ')}. They remain saved in your list.</Text>}
    <Text style={ui.title}>Best Single Store</Text>
    {!single && <Text style={ui.text}>No branch has complete price coverage for all {products.size} active products.</Text>}
    {single && <View style={ui.card}>
      <Text style={ui.heading}>{single.supermarket} · {single.branch}</Text>
      <Text style={ui.title}>USD {single.totalUsd}</Text>
      <Text style={ui.text}>Price coverage: {single.items.length}/{products.size} products</Text>
      {comparison.cheapestBranchIds.length > 1 && <Text style={ui.text}>Tied cheapest branches: {comparison.eligibleBranches.filter(b => b.rank === 1).map(b => b.branch).join(', ')}</Text>}
      {lines(single.items)}
    </View>}
    {comparison.eligibleBranches.slice(1).map(b => <View key={b.branchId} style={ui.card}>
      <Text style={ui.text}>Rank {b.rank}: {b.supermarket} · {b.branch} · USD {b.totalUsd} · Complete price coverage</Text>
    </View>)}
    <Text style={ui.title}>Multi-Store Option</Text>
    {multiStore.solution ? <>
      <Text style={ui.heading}>USD {multiStore.solution.totalUsd} · {multiStore.solution.branchIds.length} {multiStore.solution.branchIds.length === 1 ? 'branch' : 'branches'} used</Text>
      {multiStore.savings ? <Text style={ui.text}>Potential merchandise savings: USD {multiStore.savings.amountUsd} ({multiStore.savings.percentage}%)
        {multiStore.savings.amountUsdUnits === '0' ? '. No merchandise savings; prefer the simpler one-branch option.' : '. Travel costs may exceed these savings.'}</Text>
        : <Text style={ui.text}>Single-store savings unavailable: no complete single-store baseline exists.</Text>}
      {multiStore.solution.allocations.map(b => <View key={b.branchId} style={ui.card}>
        <Text style={ui.heading}>{b.supermarket} · {b.branch}</Text><Text style={ui.text}>Branch subtotal: USD {b.subtotalUsd}</Text>
        {lines(b.items)}
      </View>)}
    </> : <Text style={ui.text}>No complete solution within {result.maximumStores} {result.maximumStores === 1 ? 'branch' : 'branches'}.
      {result.missingProductIds.length ? ` No usable price anywhere for: ${names(result.missingProductIds)}.` : ' Price coverage cannot be combined within this branch limit.'}</Text>}
    {comparison.incompleteBranches.length > 0 && <Text style={ui.heading}>Incomplete branches — excluded from single-store ranking</Text>}
    {comparison.incompleteBranches.map(b => <View key={b.branchId} style={ui.card}>
      <Text style={ui.text}>{b.supermarket} · {b.branch}</Text>
      <Text style={ui.text}>Coverage: {products.size - b.missingProductIds.length}/{products.size}. Missing usable prices: {names(b.missingProductIds)}.</Text>
    </View>)}
    <Text style={ui.muted}>Evaluated: {observedLabel(result.evaluatedAt)}. All units of each product go to one branch.</Text>
    <View style={ui.notice}>
      <Text style={ui.text}>{comparison.availabilityNotice}</Text>
      <Text style={ui.muted}>Price coverage does not guarantee stock. Fixed conversion: 1 USD = 90,000 LBP.</Text>
      <Text style={ui.muted}>Exact amounts determine rankings and savings. Display amounts round to cents; rounded lines and subtotals may not add to the rounded total.</Text>
    </View>
  </View>;
}
