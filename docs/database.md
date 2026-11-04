# MySQL data model — design proposal, not executed DDL

**Status:** provisional schema guidance. Core schema is planned; migrations do not yet exist. Finalize columns and constraints in the feature branch before implementation; avoid giant speculative migrations.

## Foundational entities
| Table | Key fields | Relationships / notes |
|---|---|---|
| `products` | id PK; name; brand; variant (optional); size; unit; category; image_url; is_active | Identity includes package/variant; avoid false equality |
| `product_aliases` | id PK; product_id FK; alias; normalized_alias | Unique normalized alias where unambiguous; collisions must be resolved, not guessed |
| `supermarkets` | id PK; name unique | Chain |
| `branches` | id PK; supermarket_id FK; name; address; latitude; longitude | Chain 1:N branches; unique chain+branch identity |
| `prices` | id PK; product_id FK; branch_id FK; price DECIMAL; currency; observed_at; status; source_type; receipt_item_id nullable FK; created_at | Append-only observations; support receipt/manual/online/seed source; validated records only used for cheapest calculation |
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
- Precise product identity constraint; aliases conflicts.
- Currency conversion policy (including LBP rounding, manual rate update, provenance).
- Date-of-observation vs upload date; price freshness window.
- Whether and when guest access is supported.
- Source trust rules for manually entered vs receipt/online observations.
