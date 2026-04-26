# @v3tools/mobile

V3 Code Android app — a Capacitor 6 wrapper around the V3 cloud-mode
web bundle. Produces `com.agaminggod.v3code` on the Google Play Store.

Targets Android only in v1 (spec §8.6); iOS is deferred.

## What's inside

```
apps/mobile/
├── package.json           Workspace + Capacitor CLI scripts
├── capacitor.config.ts    webDir, plugins, remote-URL override for dev
├── scripts/
│   └── build-webview-bundle.mjs   Stages apps/web/dist-cloud/ → webview-bundle/
├── src/
│   ├── main.ts            Capacitor boot + window.v3MobileRuntime setup
│   ├── platform.ts        IS_NATIVE / NATIVE_PLATFORM / MobileRuntimeConfig
│   ├── preferencesStorage.ts   localStorage-compatible wrapper over @capacitor/preferences
│   ├── backgroundStrategy.ts   Pure decision matrix for WS + FCM + foreground service
│   └── pushTokens.ts      Bridge from @capacitor-firebase/messaging → mesh push RPC
└── android/               Gradle / Java project (seeded; cap sync fills in the rest)
```

## Build flow

A clean build from the monorepo root:

```bash
bun install
bun run build:web-cloud                  # produces apps/web/dist-cloud
bun run --cwd apps/mobile build          # stages webview-bundle/
bunx --cwd apps/mobile cap sync android  # copies webview-bundle into android/app/src/main/assets/public
bunx --cwd apps/mobile cap open android  # launch Android Studio
```

For CI release builds, `.github/workflows/release-mobile.yml` drives
this pipeline end-to-end with `./gradlew :app:bundleRelease` at the end
to produce a signed AAB.

## Runtime configuration

`scripts/build-webview-bundle.mjs` writes `webview-bundle/v3-mobile-config.json`
at build time. Fields:

| Field         | Source env var               | Purpose                                                         |
| ------------- | ---------------------------- | --------------------------------------------------------------- |
| `server_url`  | `VITE_V3_MOBILE_SERVER_URL`  | Default V3 server node URL baked into the APK                   |
| `app_version` | `VITE_V3_MOBILE_APP_VERSION` | Reported in the `hello` payload; falls back to `package.json`   |
| `channel`     | `VITE_V3_MOBILE_CHANNEL`     | `internal` \| `closed` \| `open` — matches the Play Store track |
| `origin_hint` | derived from `server_url`    | Initial origin for the WS bootstrap                             |
| `built_at`    | `new Date().toISOString()`   | Informational                                                   |

Users can still override the server URL at runtime via Settings → Server
Node → Manual URL; the baked-in value is just the default.

## Capacitor plugins

Used out-of-the-box:

- `@capacitor/core` / `@capacitor/android` — shell
- `@capacitor/preferences` — persistent Key/Value that survives Android 14+ evictions
- `@capacitor/app` — lifecycle (`pause`, `resume`, `appStateChange`)
- `@capacitor/network` — reachability → feeds `backgroundStrategy`
- `@capacitor/splash-screen` + `@capacitor/status-bar` — visual polish
- `@capacitor/keyboard` — virtual keyboard events
- `@capacitor-firebase/messaging` — FCM permission, token, notification delivery

## Firebase / FCM setup (operator)

1. Create a Firebase project, add the `com.agaminggod.v3code` Android app,
   download `google-services.json`, and drop it into
   `apps/mobile/android/app/google-services.json`.
2. In the Firebase Console → Project Settings → Service Accounts,
   generate a new private key JSON and keep it somewhere safe.
3. Sign in to the V3 server node, open `/admin`, head to the Mobile
   Push tab, and upload the service account JSON. The server AES-GCM
   encrypts the `private_key` at rest before storing (see
   `apps/server/src/identity/Layers/FcmPushConfigRepository.ts`).
4. The mesh layer now dispatches FCM notifications via
   `mesh/Services/FcmPushService.ts` whenever a physical device
   sends a chat-response, approval-request, or container-killed
   event that needs to wake a backgrounded mobile device.

Release builds inject `google-services.json` via the
`FIREBASE_GOOGLE_SERVICES` secret; the absence of the file disables
FCM silently (the server gets `FcmPushError("not-configured")` which
the mesh hub treats as a soft failure).

## Background behaviour (spec §8.6)

`apps/mobile/src/backgroundStrategy.ts` owns the decision matrix:

- `active` + idle → keep WS open, no foreground service notification.
- `paused` + streaming → show the streaming notification, keep WS open.
- `backgrounded` + idle → allow WS close, rely on FCM wake.
- `backgrounded` + streaming → if FCM is registered, allow WS close and
  rely on wake signal; otherwise, reconnect aggressively and show the
  foreground notification.
- Battery-optimisation + no FCM → warn the user via `notifyUser` code
  `battery-optimisation-blocks-wake`.

The matrix is pure TypeScript (see `backgroundStrategy.test.ts`) so we
can iterate on the policy without booting a real Android harness.

## Play Store publishing

`release-mobile.yml` handles the AAB upload. Required secrets:

- `MOBILE_SERVER_URL` — baked-in default server URL
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` — signing material
- `FIREBASE_GOOGLE_SERVICES` — contents of `google-services.json`
- `PLAY_SERVICE_ACCOUNT_JSON` — Play Developer API service account

Manual dispatch lets you pick the track (`internal`, `closed`, `open`),
and tag-triggered (`v*.*.*`) pushes always go to `internal` as a safety
net.

## Known gaps / v1 scope

- **iOS is deferred.** The Capacitor config is deliberately
  Android-only; adding iOS means reviewing APNs, provisioning
  profiles, and `@capacitor/ios`.
- **Foreground service behaviour** depends on vendor-specific
  battery-optimisation heuristics (Xiaomi, Oppo, Samsung One UI can
  still kill the process). The `backgroundStrategy` module surfaces
  `battery-optimisation-blocks-wake` so the UI can prompt the user to
  whitelist V3.
- **Multi-account on the same device** follows the same rule as the
  desktop shell: sign out, clear Preferences, sign back in as the new
  account. See spec §14.6.
