import { distanceMeters } from '../shared/geo.js';
import { chainName, digest, normalizedName, type LocationDataset, type LocationRecord } from './normalize.js';
export interface ExistingBranch { id: number; supermarketId: number; name: string; address: string; latitude: number | null; longitude: number | null }
export interface CatalogSnapshot {
  supermarkets: { id: number; name: string }[]; branches: ExistingBranch[];
  sources: { key: string; branchId: number; recordHash: string; catalogHash: string }[];
}
export interface FixtureBranch { branchId: number; supermarketId: number; name: string; address: string; latitude: number; longitude: number }
export interface PreviewRow { key: string; status: LocationRecord['status']; reasons: string[]; action: 'insert' | 'existing' | 'review' | 'reject'; existingBranchIds: number[]; candidateHashes: Record<string, string>; fixtureBranchIds: number[] }
export const demoName = (name: string) => /demonstration data|\bdemo\b/i.test(name);
export const branchDigest = (b: ExistingBranch) => digest({ supermarketId: b.supermarketId, name: b.name, address: b.address, latitude: b.latitude, longitude: b.longitude });
export const recordDigest = (r: LocationRecord) => digest(r);
export function preview(dataset: LocationDataset, catalog: CatalogSnapshot, fixture: FixtureBranch[]) {
  const chainCounts: Record<string, number> = {}, regions: Record<string, number> = {};
  const names = new Map<string, number>();
  const nameKey = (r: LocationRecord) => normalizedName(r.supermarket) + (r.chain ? ':' + normalizedName(r.branch) : '');
  for (const r of dataset.records) if (r.status !== 'rejected') names.set(nameKey(r), (names.get(nameKey(r)) ?? 0) + 1);
  const rows: PreviewRow[] = dataset.records.map(r => {
    const reasons = [...r.reasons], existingBranchIds: number[] = [], fixtureBranchIds: number[] = [], candidateHashes: Record<string, string> = {};
    const mapped = catalog.sources.find(s => s.key === r.key);
    if (r.chain) chainCounts[r.chain] = (chainCounts[r.chain] ?? 0) + 1;
    if (r.status !== 'rejected') regions[r.region ?? 'Unknown region'] = (regions[r.region ?? 'Unknown region'] ?? 0) + 1;
    if (mapped) {
      const b = catalog.branches.find(b => b.id === mapped.branchId);
      const supermarket = catalog.supermarkets.find(s => s.id === b?.supermarketId);
      if (b && supermarket && !demoName(b.name) && sameChain(r, supermarket.name) && mapped.recordHash === recordDigest(r) && mapped.catalogHash === branchDigest(b)) return { key: r.key, status: r.status, reasons, action: 'existing', existingBranchIds: [b.id], candidateHashes: { [b.id]: branchDigest(b) }, fixtureBranchIds };
      reasons.push('mapped_record_changed');
    }
    for (const b of catalog.branches) {
      const supermarket = catalog.supermarkets.find(s => s.id === b.supermarketId);
      if (!supermarket || demoName(supermarket.name) || demoName(b.name)) continue;
      const nameMatches = normalizedName(b.name) === normalizedName(r.branch) || normalizedName(supermarket.name) === normalizedName(r.supermarket);
      const located = b.latitude !== null && b.longitude !== null;
      if ((located && distanceMeters(r, { latitude: b.latitude!, longitude: b.longitude! }) <= 150)
        || (nameMatches && (!located || normalizedName(b.name) === normalizedName(r.branch)))) { existingBranchIds.push(b.id); candidateHashes[b.id] = branchDigest(b); }
    }
    // The prepared retailer fixture must also be considered when it is not yet
    // installed. This avoids creating duplicates just by reversing import order.
    if (r.chain === 'Spinneys') for (const b of fixture) if (distanceMeters(r, b) <= 300) fixtureBranchIds.push(b.branchId);
    if (existingBranchIds.length) reasons.push('possible_existing_branch');
    if (fixtureBranchIds.length) reasons.push('possible_retailer_fixture_branch');
    const matchingChains = catalog.supermarkets.filter(s => sameChain(r, s.name));
    if (matchingChains.length > 1 || (!r.chain && matchingChains.length)) reasons.push('uncertain_supermarket_identity');
    if ((names.get(nameKey(r)) ?? 0) > 1) reasons.push('duplicate_branch_or_independent_name');
    const status = r.status === 'rejected' ? 'rejected' : reasons.length ? 'manual_review' : 'auto_validated';
    return { key: r.key, status, reasons: [...new Set(reasons)].sort(), action: status === 'rejected' ? 'reject' : status === 'manual_review' ? 'review' : 'insert', existingBranchIds, candidateHashes, fixtureBranchIds };
  });
  const datasetHash = digest(dataset);
  return { format: 1 as const, datasetHash, snapshotHash: digest(catalog), rows,
    summary: { retrieved: rows.length, valid: rows.filter(r => r.status !== 'rejected').length,
      autoValidated: rows.filter(r => r.status === 'auto_validated').length, rejected: rows.filter(r => r.status === 'rejected').length,
      requiringReview: rows.filter(r => r.status === 'manual_review').length,
      suspectedDuplicates: rows.filter(r => r.reasons.some(reason => /nearby_osm|duplicate|possible_existing|possible_retailer/.test(reason))).length,
      duplicateOsmIdentifiers: rows.filter(r => r.reasons.includes('duplicate_osm_identifier')).length,
      majorChainBranches: dataset.records.filter(r => r.status !== 'rejected' && r.chain).length,
      otherNamedBusinesses: dataset.records.filter(r => r.status !== 'rejected' && !r.chain).length,
      // "Other" is a classification limit, not proof these businesses are all independent.
      chainCounts, regions, missingExpectedChains: Object.keys({ Spinneys: 1, 'Le Charcutier Aoun': 1, Carrefour: 1, 'Fahed Supermarket': 1, 'Metro Superstore': 1 }).filter(c => !chainCounts[c]),
      corridorRecords: dataset.records.filter(r => r.status !== 'rejected' && r.latitude >= 33.85 && r.latitude <= 34.18 && r.longitude >= 35.45 && r.longitude <= 35.75).length,
    } };
}
export function sameChain(r: LocationRecord, name: string): boolean {
  return !demoName(name) && (r.chain ? chainName(name) === r.chain : normalizedName(name) === normalizedName(r.supermarket));
}
