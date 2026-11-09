import { Button, Text, View } from 'react-native';
import { useState } from 'react';
import type { BasketComparison } from '../services/private-contracts';
import { basketPresentation } from '../services/basket-presentation';
import { observedLabel } from '../services/presentation';
import { ui } from './CatalogUI';

export function BasketResults({ comparison }: { comparison: BasketComparison }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const view = basketPresentation(comparison);
  return <View>
    <Text style={ui.title}>{comparison.shoppingList.name}</Text>
    <View style={ui.warning}><Text style={ui.text}>{comparison.dataLabel}</Text>
      <Text style={ui.muted}>Freshness has not been evaluated. Fixed conversion: 1 USD = 90,000 LBP.</Text>
      <Text style={ui.muted}>Ranks and ties use exact backend amounts. Displayed totals may round to the same cents; displayed line amounts may not sum to the displayed basket total.</Text>
    </View>
    {view.message && <Text accessibilityRole="alert" style={ui.text}>{view.message}</Text>}
    {view.branches.map(branch => <View key={branch.branchId} style={ui.card}>
      <Text style={ui.heading}>Rank {branch.rank} · {branch.supermarket}</Text><Text style={ui.text}>{branch.branch}</Text>
      <Text style={ui.title}>USD {branch.totalUsd}</Text>
      {branch.cheapest && <Text style={ui.heading}>Cheapest complete basket{comparison.cheapestBranchIds.length > 1 ? ' (tied)' : ''}</Text>}
      <Button title={expanded === branch.branchId ? 'Hide item breakdown' : 'View item breakdown'} onPress={() => setExpanded(expanded === branch.branchId ? null : branch.branchId)} />
      {expanded === branch.branchId && branch.lines.map(line => <View key={line.productId} style={ui.notice}>
        <Text style={ui.heading}>{line.productName}</Text><Text style={ui.text}>Quantity: {line.quantity} packages</Text>
        <Text style={ui.text}>Original unit price: {line.originalCurrency} {line.originalPrice}</Text>
        <Text style={ui.text}>USD unit price (display): {line.unitPriceUsd}</Text>
        <Text style={ui.text}>Product total (display): USD {line.lineTotalUsd}</Text>
        <Text style={ui.muted}>Observed: {observedLabel(line.observedAt)} · Verified demonstration observation</Text>
      </View>)}
    </View>)}
    {view.incomplete.length > 0 && <Text style={ui.heading}>Branches without complete price coverage</Text>}
    {view.incomplete.map(branch => <View key={branch.branchId} style={ui.card}>
      <Text style={ui.heading}>{branch.supermarket}</Text><Text style={ui.text}>{branch.branch}</Text>
      <Text style={ui.text}>{branch.explanation}</Text>
    </View>)}
    <View testID="basket-availability-notice" style={ui.notice}><Text style={ui.text}>{view.availabilityNotice}</Text></View>
  </View>;
}
