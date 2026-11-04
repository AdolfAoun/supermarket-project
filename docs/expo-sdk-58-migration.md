# Expo SDK 58 migration — 2026-11-04

Scope: mobile SDK migration only. Home, Explore, Shopping List, Receipts, and Profile retain their existing route files, JavaScript tab navigator, icons, styles, and placeholder functionality. No T02 implementation, backend/database changes, or formal requirement changes.

## Official guidance reviewed

- [Expo upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [Official expo-upgrade skill](https://github.com/expo/skills/blob/main/plugins/expo/skills/expo-upgrade/SKILL.md) (read from the official repository; not installed into this project)
- Release notes: [SDK 55](https://expo.dev/changelog/sdk-55), [SDK 56](https://expo.dev/changelog/sdk-56), [SDK 57](https://expo.dev/changelog/sdk-57), [SDK 58](https://expo.dev/changelog/sdk-58)
- [Router SDK 57 → 58 migration](https://docs.expo.dev/router/migrate/sdk-57-to-58/)

The skill recommends skipping SDK 56 because of its Hermes regression. Installed SDK 57.0.31 and aligned dependencies before upgrading to SDK 58. Used Expo's dependency mapping rather than independently selecting React/React Native versions. Node 24.11.1 / npm 11.6.2 were used; this Node version meets SDK 58's supported Node 24 minimum (24.3).

## Compatibility review

- SDK 55 removes Legacy Architecture configuration and changes Expo package version numbering. No legacy architecture setting, removed notification setting, custom Babel/Metro config, or obsolete native directories existed.
- SDK 56 changes the default fetch implementation and raises the minimum iOS target to 16.4. Existing API URL handling needs no source change. No file-system, audio, video, calendar, notification, or React Navigation imports require migration. Kept the explicit `@expo/vector-icons` dependency to preserve existing Ionicons.
- SDK 57 brings React Native 0.86; the selected intermediate patch includes the Hermes fixes.
- SDK 58 uses the strict React Native TypeScript API. The app has no private React Native imports or removed APIs. All five tabs are already explicitly declared, as required by Router 58. No custom navigators, route-state manipulation, or AppDelegate changes apply.
- Added `expo-status-bar` and `expo-font` config plugins through Expo's installer. Installed `expo-font` directly because Expo Doctor identified it as Ionicons' required native peer. Set `web.output` to `single` to preserve client-only web behavior instead of adopting Router 58's new server-output default. Express remains the only application backend.
- The iOS script was already `expo start --ios` on inspection; preserved the correct command. Windows cannot run the iOS simulator.
- Removed the `@babel/core: 7.29.7` override; npm successfully resolved dependencies without it. No `--force` or `--legacy-peer-deps` dependency bypass was used.
- Router's icon callback now accepts React Native's broader color type (including null and numeric colors), while Ionicons' `color` prop remains narrower. Passed the same color through its native text `style` instead; no cast or TypeScript legacy-API opt-out is needed. This is the only application source change; hashes of all screen files, the root layout, shared placeholder component, and API helper remain unchanged.
- No native projects are checked in; Continuous Native Generation will supply SDK 58 native templates, including the iOS scene lifecycle, when building.

## Verification

Installed versions from `npm ls --depth=0` (the lockfile pins these; package.json uses Expo-recommended compatible ranges):

| Dependency | Installed version |
|---|---|
| expo | 58.0.23 |
| react / react-dom | 19.3.0 |
| react-native | 0.88.1 |
| expo-router | 58.0.30 |
| expo-constants | 58.0.15 |
| expo-linking | 58.0.16 |
| expo-status-bar | 58.0.4 |
| expo-font | 58.0.11 |
| @expo/vector-icons | 15.1.1 |
| react-native-safe-area-context | 5.11.1 |
| react-native-screens | 4.30.1 |
| react-native-web | 0.21.4 |
| @types/react | 19.3.0 |
| typescript | 6.0.3 |
| @babel/core (transitive, no override) | 7.29.13 |

Commands ran from `mobile/`:

- `npm install expo@~57.0.21 --offline=false`, then `npx expo install --fix`: passed, resolving Expo 57.0.31 and its supported dependencies.
- `npx expo install expo@~58.0.0 --fix`: installed Expo 58 but dependency alignment initially failed on stale SDK 57 optional peer state (`@expo/ui`). Removed only the resolved `mobile/node_modules` and `mobile/package-lock.json`, then ran `npm install --offline=false` successfully. This regenerated the lockfile without dependency bypasses. Ran `npx expo install --fix` again to finish the React type alignment.
- `npx expo install expo-font`: passed; added the required direct font peer and plugin.
- `npm run typecheck`: initially caught the icon color type mismatch; passed after using native text style for the color.
- `npx expo install --check`: passed, dependencies up to date.
- `npx expo-doctor` (invoked with `--yes` to permit fetching its CLI): initially 19/20 due to missing direct `expo-font`; final result **20/20 passed**.
- `npx expo export --platform all --clear`: passed for iOS, Android, and web. Repeated `npx expo export --platform all` after the final color fix. Exported artifacts are ignored under `mobile/dist/`; exports do not constitute native builds or device testing.
- `npm ls --depth=0` and `npm ls @babel/core`: passed; Babel resolves to 7.29.13 without the old override.
- `npm audit --offline=false --json`: exit 1, **5 moderate**, 0 high/critical findings. Affected packages: `glob`, `minimatch`, and their Expo tooling dependents (`@expo/cli`, `@expo/fingerprint`, `expo`). npm's suggested remediation downgrades Expo to 53.0.11, which contradicts this task; no forced downgrade or speculative transitive overrides were applied. These upstream audit findings remain.

This environment sets `NPM_CONFIG_OFFLINE=true`; network-enabled npm/Expo commands explicitly disabled offline mode. No repository npm configuration was added.

Changed files: `mobile/package.json`, regenerated `mobile/package-lock.json`, `mobile/app.json`, `mobile/app/(tabs)/_layout.tsx`, `README.md`, `docs/frontend.md`, `docs/decisions.md`, and this record. No architecture change was necessary; frontend and decision documentation now record SDK 58 while preserving historical T01 notes.

## Manual acceptance

Open the app with an SDK 58-compatible Expo Go client and visit all five tabs, checking labels, icons, colors, headers, safe areas, and navigation on a physical device. Native builds and physical-device interaction are not verified by JavaScript export or type checking. If the installed Expo Go is incompatible, follow Expo's version guidance or use a matching development build. No deployment or publishing is part of this task.

This record supersedes the mobile-installation blocker in the historical T01 verification record; it does not claim to complete T01's outstanding WAMP/device acceptance or advance T02.
