# User requirements — authoritative baseline

Source: `Adolf_UserRequirements(2).docx`, **User Requirements Specification (28), Lebanon Supermarket Price Comparison System**. Transcribed as written; wording and **shall/should** modality are preserved. This file is the authoritative requirements baseline, **not** a statement that every feature has been implemented.

**Change control:** Practical implementation shortcuts are proposals, not automatic changes to the submitted requirements. Flag any material scope reduction for owner/advisor approval, then document it in `decisions.md` and revise the formal specification if approved.


## UR-01 — User Account and Personalization

**Requirement:** The system shall allow users to create an account and use personalized features such as saved products, shopping lists, alerts, and contribution history.

**Rationale:** Accounts allow users to save preferences and activity.

## UR-02 — Saved Products and Favorites

**Requirement:** The system shall allow logged-in users to save and remove frequently purchased products or preferred supermarkets for quick access.

**Rationale:** Saving frequently used products and supermarkets makes repeated comparisons faster.

## UR-03 — Product Search and Browsing

**Requirement:** The system shall allow users to search and browse products by name, brand, or category while recognizing abbreviations, spelling variations, and familiar alternative names.

**Rationale:** Users may refer to the same product differently, such as “Coke” and “Coca-Cola.”

## UR-04 — Product Information and Normalization

**Requirement:** The system shall display relevant product information and distinguish equivalent products using attributes such as brand, size, quantity, and unit.

**Rationale:** This prevents incorrect comparisons between different products or sizes.

## UR-05 — Product Price Comparison and Availability

**Requirement:** The system shall compare the same product across supported supermarkets, identify the lowest price, show when each price was last updated, and display product availability when reliable information exists. Otherwise, it should indicate that availability should be checked with the supermarket.

**Rationale:** Users need to know where a product is cheapest, how recent the information is, and whether it is available.

## UR-06 — Price Alerts

**Requirement:** The system should allow logged-in users to create, edit, and delete alerts for selected products using a target price or a minimum price-decrease threshold, and should notify them when a verified price meets the selected condition.

**Rationale:** Price alerts help users identify lower prices without repeatedly checking products manually.

## UR-07 — Receipt Capture

**Requirement:** The system shall allow users to upload, photograph, or scan supermarket receipts.

**Rationale:** Receipts provide an additional source of pricing data.

## UR-08 — Receipt Quality, Credibility, and Privacy

**Requirement:** The system shall check submitted receipts for readability, completeness, duplication, and credibility before using them as trusted sources, and should avoid storing unnecessary personal, card, payment, loyalty, or financial information.

**Rationale:** Low-quality, fake, modified, duplicated, or privacy-sensitive receipt data should not negatively affect the system.

## UR-09 — Automatic Receipt Processing

**Requirement:** The system shall automatically extract relevant receipt information, including supermarket name, branch when identifiable, product names, prices, sizes or quantities, and purchase date.

**Rationale:** Automatic extraction reduces manual entry and allows receipt data to be processed efficiently.

## UR-10 — Receipt Review and Controlled Confirmation

**Requirement:** The system shall allow users to review extracted information before submission. Permitted descriptive fields may be corrected, while extracted prices should not be freely editable.

**Rationale:** This reduces accidental errors and deliberate price manipulation.

## UR-11 — Product and Supermarket Matching

**Requirement:** The system shall match equivalent product names and check whether a supermarket or branch already exists before creating a new record.

**Rationale:** This prevents duplicate product and supermarket entries caused by naming differences or abbreviations.

## UR-12 — Price Validation, Conflict Handling, and Promotions

**Requirement:** The system shall detect unusual, conflicting, or promotional prices and prevent suspicious values from immediately replacing trusted ones.

**Rationale:** Large differences may result from errors, incorrect matching, fraud, or legitimate promotions.

## UR-13 — Price Verification Status

**Requirement:** The system shall classify prices according to reliability, such as verified, pending, flagged, or outdated, and require additional evidence when necessary.

**Rationale:** Questionable prices should not affect normal comparisons until sufficiently verified.

## UR-14 — Receipt Traceability

**Requirement:** The system shall keep receipt-derived prices linked to their original receipts.

**Rationale:** Pricing information should remain traceable for verification and review.

## UR-15 — Savings Highlight

**Requirement:** After processing a valid receipt, the system should display a short savings highlight when a cheaper alternative meeting a configured savings threshold is found, such as “Save $1.50 at Supermarket X.”

**Rationale:** A short savings message can attract the user's attention and encourage them to explore cheaper alternatives.

## UR-16 — Community Contributions, Reporting, and Price History

**Requirement:** The system should allow users to contribute missing prices, report incorrect or outdated prices, and view recent or historical pricing information when available.

**Rationale:** Community input and price history improve coverage and help users judge how current and reliable a price is.

## UR-17 — Shopping List and Basket Comparison

**Requirement:** The system shall allow users to create a shopping list and compare its total cost across supported supermarkets.

**Rationale:** The cheapest supermarket for one product may not be the cheapest for the entire basket.

## UR-18 — Multi-Supermarket Optimization

**Requirement:** The system shall determine whether splitting purchases across multiple supermarkets could reduce the total shopping cost.

**Rationale:** Different supermarkets may offer the best prices for different products.

## UR-19 — Shopping Optimization Preferences

**Requirement:** The system shall allow users to configure shopping preferences, including the maximum number of supermarket stops, maximum acceptable detour distance, and preference for lower cost or greater convenience, and should apply these preferences when evaluating shopping options.

**Rationale:** Shopping preferences ensure that recommended options are practical for the user as well as economical.

## UR-20 — Location and Route Configuration

**Requirement:** The system shall allow users to provide their current location, journey origin, and destination, using location access with their permission or manual entry when location access is unavailable or disabled.

**Rationale:** Reliable location information is necessary for route-based supermarket recommendations.

## UR-21 — Planned Journey Input

**Requirement:** The system shall allow users to specify a planned journey by entering an origin and destination or by describing the trip in natural language, and should allow users to review and correct the interpreted journey before requesting recommendations.

**Rationale:** Structured and natural-language trip input make route-based shopping recommendations accessible while reducing errors in interpreted locations.

## UR-22 — Route-Based Shopping Optimization

**Requirement:** The system shall identify supermarkets along the user’s planned route or within the configured maximum detour, evaluate one-store and multi-store combinations within the selected shopping preferences, and compare their estimated grocery and additional travel costs.

**Rationale:** The most economical option may involve one or several supermarkets depending on prices, route convenience, and fuel cost.

## UR-23 — Natural-Language Assistant

**Requirement:** The system shall provide a chatbot-style interface that uses natural language processing to understand user requests related to products, supermarkets, shopping lists, routes, and cost comparisons, and should present relevant results or recommendations accordingly.

**Rationale:** Natural-language interaction allows users to access the system’s features without manually navigating through multiple filters or options.

## UR-24 — Vehicle and Fuel Information

**Requirement:** The system shall allow users to provide relevant vehicle information, including fuel type and average fuel consumption, and should use the latest available fuel prices.

**Rationale:** Vehicle efficiency and current fuel prices are needed for accurate travel-cost calculations.

## UR-25 — Overall Cost Recommendation

**Requirement:** The system shall rank the evaluated shopping options by total estimated cost, including grocery prices and the additional travel cost of visiting the selected supermarket or supermarket combination, and recommend the lowest-cost option that satisfies the user’s configured preferences.

**Rationale:** The cheapest grocery basket may not produce the lowest overall cost once travel is considered.

## UR-26 — Supermarket Information and Location

**Requirement:** The system shall display basic supermarket information such as name, branch, and location.

**Rationale:** Users need to know where displayed prices are available.

## UR-27 — Multiple Data Sources

**Requirement:** The system shall support pricing data from receipts, supermarket online sources where available, and validated user contributions.

**Rationale:** Multiple sources improve coverage and reduce dependence on a single source.

## UR-28 — Clear Results Presentation

**Requirement:** The system shall present comparison results in a structured format showing the supermarket and branch, product or basket price, estimated additional travel cost when applicable, total estimated cost, price update dates, and verification status. Missing or outdated prices should be identified, and incomplete basket totals should be marked as partial estimates.

**Rationale:** Consistent cost breakdowns and data-quality indicators help users compare options and assess the reliability of each result.
