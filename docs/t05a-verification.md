# T05-A ? retained import/GPS foundations

T05-A was implemented locally on 2026-11-21 and functionally tested by the owner.
The approved T05-B assignment supersedes its original confirmation-heavy workflow
before any commit. Current delivery, UI, API changes and acceptance instructions
are in [T05-B verification](t05b-verification.md). This note preserves technical
import/security evidence; it is not an instruction to use the abandoned UI.

## Retained functionality

- Secure URL parser and normal header-only shortened-link resolution.
- Exact host/path allowlist: maps.app.goo.gl, maps.google.com, www.google.com,
  google.com; HTTPS only, no credentials/custom ports/fragments.
- Public IPv4 validation and socket pinning, normal TLS/SNI validation, four
  redirects, loop detection, five-second total deadline, 16 KiB headers, no HTML
  buffering/scraping, and a four-import concurrency limit.
- Existing authentication, no-store body-based import, safe errors and client
  runtime response validation. No stored journey or URL.
- Foreground Expo Location fix only after a user tap, denied/services-disabled/
  unavailable/stale/timeout/cancellation handling, no background watcher.

## Supported URL evidence

Documented coordinate query directions support origin/destination, travelmode,
ordered waypoints and corresponding place-ID fields. Explicit coordinate path
journeys, query/search place links and a single unambiguous place-data pin are
also recognized. Names/IDs without coordinates remain partial. Viewport centers
never supply endpoints. Encoded slashes in names cannot create stops.

The exact owner-supplied expanded internal data layout has a narrow regression:
origin 34.015658,35.673936; destination 34.0007638,35.6479666;
name Spinneys - Sahel Alma; driving. The decoder does not generalize that data
layout to ambiguous multi-stop formats. Unknown data remains unresolved.

The supplied real short link was resolved live on 2026-11-21. Normal redirects
exposed legacy saddr/daddr/geocode data, not necessarily the browser-visible
expanded directions address. Narrow tagged fixed32 URL records decode the
six-decimal destination 34.000764,35.647967; the more precise explicit origin is
preserved. The encoding/precision is disclosed in technical documentation.
This is evidence for that link at that time, not universal future reliability.
Automated short-link resolution uses controlled redirects. Synthetic additional
encodings test signs/zero/tags/ranges without claiming additional live samples.

Unsupported hosts/country domains, goo.gl/maps, HTTP, embedded Maps, viewport-only
links, ambiguous pins, unknown internal structures and links needing consent,
JavaScript or scraping are explicitly unsupported/partial. IDs are not geocoded.
No undocumented Google API, routing geometry, distance or time is retrieved.

## Intentionally retired in T05-B

JourneySection and its verbose Preview helper; confirmed/imported reducer state;
confirm/edit/driving/reset action wrappers; canConfirmJourney/completeJourney;
requiresConfirmation in the uncommitted import response; separate Confirm Journey
and Clear Journey controls and their specific confirmation assertions. Replaced
with a small coordinate/mode draft, compact import/summary and direct discovery.
Useful single-place assignment remains for partial imports. All parser/resolver,
GPS, authentication and stale-session security regressions remain active.

Historical T05-A checks passed 130 backend, 90 mobile and 10 private/browser checks
before refinement, with all-platform exports. Current tests have been updated for
the approved T05-B behavior; see that report for final counts and known limits.
No physical-device acceptance is inferred from browser GPS or native exports.

Sources: [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
and [SDK 58 Location](https://docs.expo.dev/versions/v58.0.0/sdk/location/).
