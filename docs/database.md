# MySQL data model

**Status:** T02-A is implemented, imported into local WampServer MySQL, and manually verified by the owner. Counts match: 36 products, 12 aliases, 3 supermarkets, 4 branches and 125 price observations. See [T02-A verification](t02a-verification.md) and [execution instructions](../database/README.md). Other entities below remain proposals; T02-B has not started. No business API or mobile changes.

## T02-A implemented foundation

- Run `database/migrations/001_catalog.sql` once, then optionally `database/seeds/001_demo_catalog.sql` in an empty catalog. MySQL 8.0.16+, InnoDB and `utf8mb4_0900_ai_ci`; import sessions enable strict mode and UTC without changing server configuration or accounts.
- Integer primary keys (`prices.id` uses `BIGINT UNSIGNED`); restrictive foreign keys prevent deleting referenced parents. Products have many aliases/observations, chains have many branches, and each observation references one product and one branch.
- Product uniqueness: `(name, brand, variant, size, unit, pack_quantity)`. Non-null `variant` defaults to an empty string to avoid nullable-unique loopholes. Positive `size DECIMAL(10,3)` measures one pack member; positive `pack_quantity` counts members. A six-pack of 1.5 L bottles is `size=1.5, unit='L', pack_quantity=6`. Units: `ml`, `L`, `g`, `kg`, `piece`, `roll`, `sheet`. Curators must use consistent representations; `1 L` and `1000 ml` are not automatically reconciled. Category is a required free-text label, without a category entity/FK.
- Aliases have a stored generated, globally unique normalized key: lowercase, remove ASCII spaces and hyphens. Curated aliases retain size/pack information; collisions fail rather than reassign. Other punctuation, tabs, transliteration and fuzzy matching are not handled. Future exact lookups must use this same normalization. Text comparison follows the case/accent-insensitive collation.
- Chain names are unique; `(supermarket_id, name)` identifies branches. Required addresses; coordinates must be both absent or both present and bounded. Demo coordinates remain absent instead of being invented.
- Strictly positive `price DECIMAL(12,2)` is the price of **one complete catalog package**, not receipt line total or a per-kg conversion. Currency permits USD/LBP codes, but the seed uses **USD only**; permitting a code defines no conversion policy. Status is constrained to `pending` (default), `verified`, `flagged`, `rejected`; `outdated` remains derived from future freshness rules.
- Required `observed_at` records source time; defaulted `created_at` records ingestion time, both `DATETIME(6)` under a UTC convention. Observations cannot predate 1970; future-date plausibility is deferred server validation. Future connections must independently use strict mode/UTC. There are no auto-updated observation timestamps.
- Current sources: `seed`, `manual`, `online`. Seed notes must begin `DEMONSTRATION DATA`. Receipt source and `receipt_item_id` are deferred **together** until their FK can be enforced; this milestone cannot store unlinked receipt-derived observations.
- Indexes cover name (identity prefix), brand/category browsing, aliases, branch identity, product/branch/status/time and branch/product. No unique product/branch or product/branch/time constraint: new observations preserve history. Normal operations must insert observations rather than overwrite/delete amounts. No immutability triggers, grants changes or verification workflows are added; privileged SQL can still modify rows. Future server workflows must enforce normal-operation immutability.
- Seed: 36 products in six categories, 12 aliases, three chains, four fictional Lebanese branch scenarios, 125 explicitly labeled USD observations. Simulated statuses and January 2026 dates are not real verification/freshness claims. Branch four deliberately lacks products 13–36, illustrating incomplete coverage.

Inspect the latest **verified candidate** for a product/branch (without asserting
freshness, source eligibility or availability):

```sql
SELECT id, product_id, branch_id, price, currency, observed_at, status, source_type, source_note
FROM prices
WHERE product_id = 1 AND branch_id = 1 AND status = 'verified'
ORDER BY observed_at DESC, id DESC
LIMIT 1;
```

The fixture returns USD 1.70 despite newer pending/flagged/rejected observations.
Seed data must remain visibly demonstrative. Real comparisons also need approved
source/freshness rules and must separate currencies until conversion is defined.

## Foundational entities
| Table | Key fields | Relationships / notes |
|---|---|---|
| `products` | id PK; name; brand; variant; size; unit; pack_quantity; category; image_url; is_active; created_at | Identity includes package/variant; avoid false equality |
| `product_aliases` | id PK; product_id FK; alias; normalized_alias | Unique normalized alias where unambiguous; collisions must be resolved, not guessed |
| `supermarkets` | id PK; name unique | Chain |
| `branches` | id PK; supermarket_id FK; name; address; latitude; longitude | Chain 1:N branches; unique chain+branch identity |
| `prices` | id PK; product_id FK; branch_id FK; price DECIMAL; currency; observed_at; status; source_type; source_note; created_at | Append-only normal operations; manual/online/seed sources now, receipt_item_id FK and receipt source later; validated eligible records only for comparison |
| `users` | id PK; name; email unique; password_hash; created_at | Auth after core catalog |
| `shopping_lists` | id PK; user_id FK; name; created_at | User 1:N lists |
| `shopping_list_items` | id PK; shopping_list_id FK; product_id FK; quantity positive | Unique (shopping_list_id, product_id) |
| `receipts` | id PK; user_id FK; branch_id nullable FK; purchase_date; image_path; content_fingerprint; status; created_at | Receipt duplicate checks, private image storage |
| `receipt_items` | id PK; receipt_id FK; product_id nullable FK; extracted_name; quantity; unit_price; total_price | Original OCR monetary fields preserved; manual product selection permitted |

## Later supporting tables
| Table | Intent |
|---|---|
| `favorites` | User bookmarks products or branches; enforce exactly one target per record, or split tables if implementation simpler |
| `price_alerts` | User, product, target or percent-decrease threshold, enable/disable |
| `price_reports` | User, reported observation, reason, status |
| `user_preferences` | Consumption, fuel type, max stops, detour and convenience preference |

## Relationship sketch
```text
supermarkets 1--N branches 1--N prices N--1 products 1--N product_aliases
users 1--N shopping_lists 1--N shopping_list_items N--1 products
users 1--N receipts 1--N receipt_items N--0..1 products
receipt_items 1--0..N prices  (price observation may cite source receipt item)
```

## Nonnegotiable data-quality rules
- MySQL 8 with InnoDB foreign keys; use integer keys, timestamps, appropriate `UNIQUE` and `CHECK` constraints, indexed common searches, and parameterized queries.
- `price >= 0` is only a safety floor; business validation may require strictly positive values. Explicitly distinguish unit price from receipt line total.
- Compare currencies only after conversion with a **rate and rate timestamp**; conversion strategy/rate source remain to be decided. Do not silently treat USD and LBP as equal.
- Keep source observations and verification state. Store `pending`, `verified`, `flagged`, `rejected`; compute `outdated` from age + freshness policy (TBD).
- Latest verified price for **same product and branch** is candidate for normal comparison, subject to freshness, source policy and conversions. Do not mix different package sizes.
- Do not count a store's subtotal as a complete basket total if it lacks one or more required items.
- For OCR, extracted price is immutable from the user's perspective; the server may compute a verified unit price using line total and quantity with explicit rules.
- Treat images and raw text as sensitive. Avoid keeping payment, card or loyalty information; establish retention/deletion policy when implementing receipts.
- Receipt/price reference direction introduces a dependency: create `receipt_items` before adding an enforced `prices.receipt_item_id` FK, or add that FK in a later migration.
- UUIDs, admin workflows, source-specific tables, exchange rates and availability records may be added as requirements become active; do not invent elaborate systems prematurely.

## Rollout
1. `products`, `product_aliases`, `supermarkets`, `branches`, `prices` (without receipt FK until receipts migration).
2. `users`, `shopping_lists`, `shopping_list_items`.
3. `receipts`, `receipt_items`; add receipt source foreign key to `prices`.
4. Supporting tables as features are scheduled.

## Explicit open decisions
- Future canonical unit conversion, catalog identity edits and alias collision review; T02-A implements the curated identity/normalization described above.
- Currency conversion policy (including LBP rounding, manual rate update, provenance).
- Date-of-observation vs upload date; price freshness window.
- Whether and when guest access is supported.
- Source trust rules for manually entered vs receipt/online observations.
