import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { recordDigest, branchDigest, demoName, preview, sameChain, type CatalogSnapshot, type ExistingBranch, type FixtureBranch } from './preview.js';
import { digest, type LocationDataset } from './normalize.js';
import { validCoordinates } from '../shared/geo.js';
import { withinBoundary } from './geometry.js';

export type LocationPreview = ReturnType<typeof preview>;
export interface Approval { datasetHash: string; previewHash: string; database: string; decisions: { key: string; action: 'insert' | 'link'; branchId?: number; supermarketId?: number; branchName?: string; note?: string; distinctFromBranchIds?: number[]; distinctFromFixtureIds?: number[] }[] }
export async function readSnapshot(connection: Connection, lock = false): Promise<CatalogSnapshot> {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [supermarkets] = await connection.query<RowDataPacket[]>('SELECT id,name FROM supermarkets ORDER BY id' + suffix);
  const [branches] = await connection.query<RowDataPacket[]>('SELECT id,supermarket_id,name,address,latitude,longitude FROM branches ORDER BY id' + suffix);
  const [[table]] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='branch_location_sources'");
  const sources = table.n ? (await connection.query<RowDataPacket[]>('SELECT osm_type,CAST(osm_id AS CHAR) osm_id,branch_id,record_hash,catalog_hash FROM branch_location_sources ORDER BY osm_type,osm_id' + suffix))[0] : [];
  return { supermarkets: supermarkets.map(s => ({ id: s.id, name: s.name })),
    branches: branches.map(b => ({ id: b.id, supermarketId: b.supermarket_id, name: b.name, address: b.address, latitude: b.latitude === null ? null : Number(b.latitude), longitude: b.longitude === null ? null : Number(b.longitude) })),
    sources: sources.map(s => ({ key: `${s.osm_type}/${s.osm_id}`, branchId: s.branch_id, recordHash: s.record_hash, catalogHash: s.catalog_hash })) };
}
// No network, DDL, update, delete or prices are performed in this transaction.
// The application CLI never calls this without an explicit digest-bound approval.
export async function importApproved(connection: Connection, dataset: LocationDataset, base: LocationPreview, approval: Approval, fixture: FixtureBranch[], boundary: unknown) {
  if (dataset.format !== 1 || approval.datasetHash !== digest(dataset) || approval.datasetHash !== base.datasetHash || approval.previewHash !== digest(base)) throw new Error('Dataset/preview approval hash mismatch');
  if (!Array.isArray(approval.decisions) || !approval.decisions.length || approval.decisions.length > 10000 || new Set(approval.decisions.map(d => d.key)).size !== approval.decisions.length) throw new Error('Approve unique explicit records');
  if (dataset.records.length > 10000 || new Set(dataset.records.map(r => r.key)).size !== dataset.records.length) throw new Error('Invalid dataset identifiers');
  const [[database]] = await connection.query<RowDataPacket[]>('SELECT DATABASE() name');
  if (database.name !== approval.database) throw new Error('Wrong database');
  const [[ledger]] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='branch_location_sources' AND engine='InnoDB'");
  if (!ledger.n) throw new Error('Manually approved migration 003 is required; importer never runs DDL');
  // Lock waits are bounded; concurrent imports and application insertions either
  // serialize or fail/rollback through existing InnoDB unique/FK constraints.
  await connection.query('SET SESSION innodb_lock_wait_timeout=10');
  await connection.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  await connection.beginTransaction();
  const result = { insertedBranches: 0, linkedSources: 0, alreadyPresent: 0, insertedSupermarkets: 0 };
  try {
    const catalog = await readSnapshot(connection, true), current = preview(dataset, catalog, fixture);
    for (const decision of approval.decisions) {
      const record = dataset.records.find(r => r.key === decision.key), row = current.rows.find(r => r.key === decision.key), prior = base.rows.find(r => r.key === decision.key);
      if (!record || !row || !prior || record.status === 'rejected' || row.action === 'reject' || !/^(node|way|relation)\/[1-9]\d{0,18}$/.test(record.key)
        || !validCoordinates(record.latitude, record.longitude) || !withinBoundary([record.longitude, record.latitude], boundary)
        || !record.name?.trim() || !record.supermarket?.trim() || !record.branch?.trim() || !record.address?.trim()
        || record.supermarket.length > 120 || record.branch.length > 120 || record.address.length > 255 || demoName(record.supermarket) || demoName(record.branch)) throw new Error('Rejected/invalid record cannot be imported');
      if (!['insert', 'link'].includes(decision.action)) throw new Error('Invalid approval action');
      if (row.action === 'existing') { result.alreadyPresent++; continue; }
      if (row.reasons.includes('mapped_record_changed')) throw new Error('OSM or catalog record changed; review update separately');
      if (row.existingBranchIds.some(id => !prior.existingBranchIds.includes(id))) throw new Error('Catalog changed since preview; regenerate approval');
      if ((row.status === 'manual_review' || decision.action === 'link' || decision.branchName || decision.supermarketId) && (!decision.note || decision.note.trim().length < 12)) throw new Error('Manual decisions need an explicit review note');
      let branch: ExistingBranch;
      if (decision.action === 'link') {
        const found = catalog.branches.find(b => b.id === decision.branchId), supermarket = catalog.supermarkets.find(s => s.id === found?.supermarketId);
        if (!found || !supermarket || found.latitude === null || found.longitude === null || demoName(found.name) || !sameChain(record, supermarket.name)
          || !row.existingBranchIds.includes(found.id)) throw new Error('Unsafe branch link; must be a reviewed existing candidate of the same business');
        if (!prior.existingBranchIds.includes(found.id)) throw new Error('Linked branch was not in approved preview');
        if (prior.candidateHashes[found.id] !== branchDigest(found)) throw new Error('Linked branch changed since preview');
        branch = found; // Preserve existing names, addresses and higher-trust coordinates.
        result.linkedSources++;
      } else {
        const explicitlyDistinct = (expected: number[], actual: number[] | undefined) => !expected.length || !!actual
          && new Set(actual).size === expected.length && expected.every(id => actual.includes(id)) && !!decision.note && decision.note.trim().length >= 12;
        if (!explicitlyDistinct(row.fixtureBranchIds, decision.distinctFromFixtureIds)) throw new Error('Possible retailer-fixture duplicate; review/link, explicitly confirm distinct, or omit');
        if (!explicitlyDistinct(row.existingBranchIds, decision.distinctFromBranchIds)) throw new Error('Possible existing duplicate; review/link, explicitly confirm distinct, or omit');
        const matching = catalog.supermarkets.filter(s => sameChain(record, s.name));
        if (!decision.supermarketId && matching.length > 1) throw new Error('Multiple supermarket identities require explicit review');
        let supermarket = decision.supermarketId ? catalog.supermarkets.find(s => s.id === decision.supermarketId) : matching[0];
        if (supermarket && (!sameChain(record, supermarket.name) || (!record.chain && !decision.supermarketId))) throw new Error('Independent supermarket identity requires explicit review');
        if (decision.supermarketId && !supermarket) throw new Error('Approved supermarket no longer exists');
        if (!supermarket) {
          const [created] = await connection.execute<ResultSetHeader>('INSERT INTO supermarkets(name) VALUES (?)', [record.supermarket]);
          supermarket = { id: created.insertId, name: record.supermarket }; catalog.supermarkets.push(supermarket); result.insertedSupermarkets++;
        }
        const name = decision.branchName ?? record.branch;
        if (!name.trim() || name.length > 120 || demoName(name)) throw new Error('Invalid reviewed branch name');
        const [created] = await connection.execute<ResultSetHeader>('INSERT INTO branches(supermarket_id,name,address,latitude,longitude) VALUES (?,?,?,?,?)',
          [supermarket.id, name, record.address, record.latitude, record.longitude]);
        branch = { id: created.insertId, supermarketId: supermarket.id, name, address: record.address, latitude: record.latitude, longitude: record.longitude };
        catalog.branches.push(branch); result.insertedBranches++;
      }
      const [type, id] = record.key.split('/');
      await connection.execute('INSERT INTO branch_location_sources(osm_type,osm_id,branch_id,record_hash,catalog_hash,review_status,provenance) VALUES (?,?,?,?,?,?,?)',
        [type, id, branch.id, recordDigest(record), branchDigest(branch), row.status === 'auto_validated' && !decision.note ? 'auto_validated' : 'owner_reviewed',
          JSON.stringify({ source: dataset.source, osm: record.sourceUrl, website: record.website, phone: record.phone, name: record.originalName,
            method: record.method, locality: record.locality, sourceTimestamp: record.sourceTimestamp, reasons: row.reasons, reviewNote: decision.note ?? null,
            physicallyVerified: false, approvalHash: digest(approval) })]);
    }
    await connection.commit(); return result;
  } catch (error) { await connection.rollback(); throw error; }
}
