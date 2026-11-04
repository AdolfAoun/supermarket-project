# System architecture

**Status:** initial agreed direction; individual integrations are not implemented yet.

## Purpose
Mobile-first Lebanese supermarket price comparison system, supporting branch-specific prices, receipt-sourced observations, shopping lists, and eventually route-aware multi-store optimization. Build a useful end-to-end MVP before optional sophistication.

## Confirmed stack
| Layer | Choice | Notes |
|---|---|---|
| Mobile | React Native + Expo + TypeScript | Expo Router planned for tab/stack navigation |
| Server | Node.js + Express + TypeScript | Modular monolith, REST JSON API |
| Data | MySQL (WAMP locally) | Use `mysql2/promise`, parameterized SQL, migrations |
| Maps / routes | Google Maps Platform | Intended; assess billing/quota before use |
| Receipt images | Local private server storage initially | Storage abstraction enables later cloud migration |
| Version control | Git + GitHub | Private repository recommended |
| Coding | Codex | Claude optional for independent code review |

## Future/investigational (not initial dependencies)
- Authentication: simple email/password; Argon2id password hashing and JWT proposed. Implement later and check secure token storage/refresh design before coding.
- OCR: Google ML Kit on-device text recognition is the preferred free candidate; Expo development build/native package compatibility needs verification. If too complex, evaluate free Tesseract in backend. Extraction and product interpretation are separate steps.
- Assistant: postponed; OpenAI API can incur usage charges. A free/low-cost approach is to be evaluated after core features work.
- Routing: Google Maps pricing and billing may apply; no assumption of unlimited free use.

## Logical data flow
```text
React Native / Expo (screens, local UI state)
                  |
            HTTPS / JSON
                  v
Node.js / Express REST API
  auth  products  branches  prices  shopping lists
  receipts  validation  optimization  routing (later)
                  |
           parameterized SQL
                  v
             MySQL

Future external integration boundaries:
  ML Kit (mobile OCR) -> review -> API receipt submission
  Google Maps (route distance/detours) -> backend cost evaluation
  Assistant (natural language) -> controlled backend functions
```

## Design invariants
1. Frontend displays data; backend applies authoritative product identity, verification, permissions and optimization rules.
2. One product identity includes brand/variant/package size/units; different sizes are not interchangeable.
3. Prices refer to **branches**, not just chains; preserve observation source and time.
4. No new receipt price becomes automatically trustworthy solely due to OCR or user confirmation.
5. Unknown OCR products are matched manually from the controlled catalog; the user cannot freely change receipt prices.
6. Show currency and freshness; a missing or outdated price does not magically become a valid complete basket quote.
7. Build and test vertically after a small navigation shell: screen -> endpoint -> database -> tests.
8. Do not overfit to hypothetical nationwide coverage; begin with a small demonstration dataset, clearly labeled as such.

## Deployment boundary
WAMP/MySQL are local development services. Phones cannot use `localhost` to reach the PC backend; use a configured LAN URL for Expo development, with appropriate local firewall/network configuration. Use suitable backend + database hosting for any public deployment. Keep DB credentials server-side.
