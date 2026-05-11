## [2026-05-07] - Settings Search, GitHub OAuth, Appearance, and Desktop Icon Fixes

### What Was Implemented

- Replaced the Git settings sign-in action with the existing GitHub OAuth redirect/desktop loopback flow instead of the legacy Device Flow dialog.
- Kept the legacy GitHub public client ID setting in place for development/device-flow fallback use.
- Built a Windows x64 release installer for `0.0.25-v3.20260507.settings-github-oauth-search`.
- Added Git LFS tracking for release `.exe` artifacts so the installer can be included without exceeding GitHub's normal blob limit.
- Added a settings sidebar search bar with cross-section results and Ctrl+F-style match highlighting.
- Moved settings navigation metadata into a shared settings navigation module so the sidebar and search index use the same route types.
- Updated the Codex-like appearance preview swatch to match the neutral Codex CSS tokens instead of green.
- Changed the composer shortcut copy and chips to show Ctrl+Enter only.
- Loaded desktop window icons through `nativeImage` so runtime windows receive the V3 icon instead of falling back to Electron defaults.

### Files Modified

- `apps/web/src/v3/ui/ConnectGitHubButton.tsx` - switched connection handling to OAuth redirect/desktop loopback and removed Device Flow UI branching.
- `apps/web/src/components/settings/GitSettings.tsx` - wired GitHub sign-in to the new OAuth button behavior while retaining the legacy client ID setting.
- `apps/web/src/components/settings/SettingsSidebarNav.tsx` - added the search input, result list, and highlighted result rendering above the General tab.
- `apps/web/src/components/settings/settingsNavigation.ts` - added shared settings route/navigation metadata.
- `apps/web/src/components/settings/settingsSearch.ts` - added the cross-section settings search index and ranking logic.
- `apps/web/src/components/settings/ConfigurationSettings.tsx` - changed the composer shortcut display to Ctrl+Enter.
- `apps/web/src/themes/themePalettes.ts` - aligned the Codex-like swatch with neutral Codex theme values.
- `apps/desktop/src/main.ts` - resolved desktop icons as `nativeImage` instances before passing them to BrowserWindow.
- `scripts/build-desktop-artifact.ts` - preserved the unsigned Windows build fallback that avoids electron-builder's symlink-sensitive winCodeSign extraction path.
- `.gitattributes` - added Git LFS tracking for release `.exe` artifacts.
- `release/V3-Code-0.0.25-v3.20260507.settings-github-oauth-search-x64.exe` - added the new Windows x64 installer artifact through Git LFS.
- `release/V3-Code-0.0.25-v3.20260507.settings-github-oauth-search-x64.exe.blockmap` - added the installer blockmap.
- `release/latest.yml` - added update metadata for the new installer.
- `PROJECT_LOG.md` - recorded this implementation.

### Assumptions Made (flag these for review)

- The visible GitHub sign-in control should prefer OAuth everywhere and only leave Device Flow settings for legacy/development fallback.
- The settings search should be a sidebar search index across settings pages, with matching terms highlighted in result titles and descriptions.
- Runtime BrowserWindow icon assignment is enough to fix the visible desktop/taskbar window icon in the local app.

### Known Issues / Deferred

- Search indexing is static settings metadata, so highly dynamic provider/device names are represented by their setting categories rather than every runtime value.
- Unsigned Windows installer builds still skip electron-builder executable resource editing because the local non-admin shell cannot extract winCodeSign's Darwin symlinks; a signed/admin release build is still needed to verify embedded executable metadata.
- Windows may continue to show cached taskbar or pinned shortcut icons until the shortcut/icon cache is refreshed or a freshly built app is installed.

### Suggested Next Steps

- Add a browser-level screenshot pass for the settings sidebar search once the dev server is running.
- Verify a fresh Windows desktop artifact after `bun run dist:desktop:win:x64`.

## [2026-05-06] - V3 UI, Import, GitHub, Usage, and Fallback Fixes

### What Was Implemented

- Pulled latest changes with `git pull --ff-only` and worked on `codex/ui-import-github-fallback-fixes`.
- Fixed boot-time banner rendering by keeping `ConfigureServerBanner` at the root and removing the duplicate chat-route render.
- Reworked alert/banner action layout so button groups wrap cleanly instead of squeezing text into narrow columns.
- Added Windows titlebar-safe right padding to the multi-agent toolbar to prevent top-right controls from overlapping.
- Updated desktop resource path fallbacks so dev and packaged launches can resolve V3 icon assets instead of falling back to Electron defaults.
- Replaced green Codex-theme accents with neutral white, gray, and light-black tokens.
- Normalized settings control sizes for checkbox rows, segmented options, radio cards, select fields, and button groups.
- Redesigned the composer send shortcut setting with keyboard-style chips and clearer copy for Enter versus Ctrl/Cmd+Enter behavior.
- Added schema-backed `autoFallback` settings with default-off behavior, fallback provider/model fields, and the `usage-limit` trigger.
- Added a conservative auto-fallback coordinator that only starts a fallback thread when a provider task errors after explicit usage or rate-limit signals.
- Reworked chat import scanning from one mixed list into provider-specific scanning for Codex, Claude, Anthropic Console, Gemini CLI, Cursor, Windsurf, OpenCode, and custom folders.
- Added richer transcript metadata so import rows show provider, title, summary, path, size, date, and parser status instead of raw JSON labels.
- Marked unsupported provider formats as recognized but not importable instead of mixing them silently into importable results.
- Fixed GitHub desktop device flow UX by checking for a configured public client ID before opening the device-flow dialog and surfacing setup guidance when it is missing.
- Added provider-reported rate-limit projection and Usage UI summaries for active runtime duration, token totals, provider snapshots, and exact remaining quota only when providers report it.
- Smoke-checked the paired web app with Playwright at desktop, tablet, and mobile widths for the app shell, Configuration settings, import dialog, Git settings, and Usage page.

### Files Modified

- `apps/desktop/src/main.ts` - added icon resource path fallbacks for dev and packaged desktop launches.
- `apps/desktop/src/preload.ts` - exposed GitHub client configuration checks to the web UI.
- `apps/desktop/src/v3ChatImport.test.ts` - updated desktop import tests for provider-specific scans and formatted previews.
- `apps/desktop/src/v3ChatImport.ts` - validated provider-specific import IPC requests and passed provider options through safely.
- `apps/desktop/src/v3ChatImportCore.test.ts` - added coverage for provider-specific scans and unsupported-provider handling.
- `apps/desktop/src/v3ChatImportCore.ts` - rebuilt local scan/import logic around explicit providers, metadata extraction, and parser status.
- `apps/desktop/src/v3GitHubAuth.ts` - added typed GitHub client ID configuration detection before device flow startup.
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts` - covered provider rate-limit activity projection.
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` - projected provider rate-limit updates into orchestration activity events.
- `apps/web/src/components/AutoFallbackCoordinator.tsx` - added conservative usage-limit-only fallback thread startup.
- `apps/web/src/components/chat/ConfigureServerBanner.tsx` - made banner action buttons consistently sized and wrap-friendly.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - replaced mixed transcript scan UI with provider-specific scanning and formatted rows.
- `apps/web/src/components/multiChat/MultiChatWorkspace.tsx` - added titlebar-safe right padding for window controls.
- `apps/web/src/components/settings/ConfigurationSettings.tsx` - normalized settings controls, redesigned composer shortcut UI, and added auto fallback settings.
- `apps/web/src/components/settings/SettingsPanels.browser.tsx` - updated desktop bridge fixture shape for the new GitHub config method.
- `apps/web/src/components/settings/UsageSettings.tsx` - added active runtime, provider-reported limits, and clearer token usage summaries.
- `apps/web/src/components/ui/alert.tsx` - changed alert layout so action groups do not squeeze text content.
- `apps/web/src/index.css` - changed Codex theme accents from green to neutral tones.
- `apps/web/src/lib/providerUsage.ts` - added shared helpers for provider usage/rate-limit snapshots and explicit limit detection.
- `apps/web/src/localApi.test.ts` - updated local API fixtures for the new desktop GitHub bridge method.
- `apps/web/src/routes/__root.tsx` - mounted the root banner and auto-fallback coordinator once.
- `apps/web/src/routes/_chat.tsx` - removed duplicate boot banner rendering.
- `apps/web/src/v3/auth/githubBridge.ts` - added desktop GitHub client config lookup.
- `apps/web/src/v3/ui/ConnectGitHubButton.tsx` - surfaced missing GitHub public client ID setup before device flow.
- `apps/web/src/v3/ui/GitHubDeviceCodeDialog.tsx` - corrected device-flow error styling tokens.
- `packages/contracts/src/chatImport.ts` - added provider, parser status, and richer import metadata schemas.
- `packages/contracts/src/ipc.ts` - extended desktop chat-import and GitHub IPC contracts.
- `packages/contracts/src/settings.ts` - added `autoFallback` settings schema and defaults.
- `PROJECT_LOG.md` - recorded this implementation.

### Assumptions Made (flag these for review)

- No GitHub OAuth client ID should be committed; users or builds must provide it through settings, environment, or embedded release config.
- Gemini CLI, Cursor, Windsurf, OpenCode, and custom transcript roots should be discoverable and clearly labeled now, but remain non-importable until their local transcript formats are safely parsed and tested.
- Auto fallback should create a new fallback thread rather than mutating or retrying the original failed thread.
- Provider quota data must not be guessed; exact remaining plan/quota is shown only when the provider reports it.
- Desktop taskbar icons may still require Windows taskbar cache or pinned shortcut refresh outside the app after the resource path is fixed.

### Known Issues / Deferred

- Full import parsing for Gemini CLI, Cursor, Windsurf, OpenCode, and arbitrary custom transcript formats is deferred until sample formats are available.
- Exact Codex plan remaining and cross-provider subscription quota cannot be shown unless provider APIs or runtime events report it.
- `bun run test` was attempted for the full monorepo but timed out locally after 10 minutes; focused changed-area tests passed.
- Windows installer artifact verification was not run in this pass.

### Suggested Next Steps

- Add safe parsers and fixtures for Gemini CLI, Cursor, Windsurf, and OpenCode once representative local transcript samples are confirmed.
- Add a server-side fallback policy layer if fallback behavior should work when the web UI is closed.
- Add provider-specific quota connectors when official APIs expose remaining plan usage.
- Verify the desktop icon in a fresh Windows install or after clearing pinned shortcut icon cache.

## [2026-04-29] - Settings, OAuth, Provider-Style UI, and Live Control Repair

### What Was Implemented

- Reworked Settings into scroll-safe page containers and removed the duplicate user-facing GitHub sign-in surface from the legacy Connections page.
- Added Codex-style runtime configuration fields for provider/model defaults, reasoning effort, approval policy, sandbox mode, workspace network, plan mode, web search, terminal/editor destination, notifications, custom prompts, MCP, worktrees, browser use, dictation, usage, and pricing.
- Wired runtime settings into chat/thread startup so Codex reasoning effort, approval policy, sandbox mode, runtime mode, and plan-mode defaults flow into provider session startup instead of only persisting in local UI state.
- Replaced palette-only theme selection with persisted `interfaceProfile` support and added provider-inspired app-shell styling hooks for V3, Codex-like, Claude-like, Cursor-like, and Windsurf-like profiles.
- Repaired GitHub sign-in routing so server-node/web mode uses the account-scoped server OAuth flow, while desktop Device Flow remains a local-only fallback.
- Confirmed `/login` uses the existing Google OAuth authorize/callback endpoints and exposed the expected Google redirect URI in the admin server summary for setup verification.
- Added real settings panels for MCP Servers, Worktrees, Browser Use, Usage, Configuration, Personalization, Appearance, Git, and Environments; removed `StubPanel` and added an audit test that fails on visible `Coming soon`/stub regressions.
- Promoted the admin surface into `/control`, improved live-chat/device page responsiveness, and preserved the existing multi-chat single/left-right/up-down/four-quadrant pane support.
- Built the Windows NSIS installer and copied the fresh installer/update metadata into the `release.exe` artifact folder.

### Files Modified

- `packages/contracts/src/settings.ts` - added normalized runtime, interface profile, MCP, worktree, browser-use, dictation, usage, and pricing settings schemas.
- `packages/contracts/src/orchestration.ts` - added approval policy and sandbox mode to turn-start command contracts.
- `apps/server/src/codexAppServerManager.ts` - applied approval/sandbox overrides when starting or resuming Codex app-server sessions.
- `apps/server/src/orchestration/decider.ts` - carries runtime overrides through turn-start events.
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` - forwards runtime overrides into provider session startup.
- `apps/server/src/provider/Layers/CodexAdapter.ts` - passes runtime overrides into the Codex manager.
- `apps/server/src/admin/http.ts` and `packages/contracts/src/admin.ts` - report Google OAuth redirect URI in admin setup data.
- `apps/web/src/lib/codexRuntimeSettings.ts` - shared UI/runtime mapping for Codex settings.
- `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/lib/startThreadFromFolder.ts`, `apps/web/src/components/HomeComposer.tsx`, and `apps/web/src/components/multiChat/MultiChatWorkspace.tsx` - consume runtime settings during compose, draft creation, and thread startup.
- `apps/web/src/components/settings/*.tsx` and `apps/web/src/routes/settings.*.tsx` - rebuilt settings tabs, removed stubs, and applied the shared scroll container.
- `apps/web/src/hooks/useTheme.ts`, `apps/web/src/index.css`, and `apps/web/src/themes/*.ts` - added interface profile persistence and profile-level UI styling.
- `apps/web/src/v3/ui/ConnectGitHubButton.tsx` - prefers server OAuth and labels desktop Device Flow as local-only fallback.
- `apps/web/src/routes/admin.tsx`, `apps/web/src/routes/control.tsx`, and `apps/web/src/routeTree.gen.ts` - added the Control Center route and refreshed route generation.
- `apps/web/src/components/settings/settingsAudit.test.ts` - regression guard for stubs and duplicate GitHub sign-in surfaces.

### Assumptions Made (flag these for review)

- Provider-inspired profiles must stay legally distinct and use layout/density/color behavior rather than copied proprietary assets, icons, names, or fonts.
- The existing server Google OAuth endpoints remain the production web login source of truth.
- Desktop Device Flow remains useful for local-only GitHub access when the account-scoped server OAuth config is unavailable.
- Settings that do not yet have a backend runtime endpoint should show concrete device/configuration status and save only schema-backed configuration, not fake enabled states.

### Known Issues / Deferred

- MCP server CRUD is schema/UI-ready, but full import from Codex/Claude config files and provider-session injection still needs backend implementation.
- Worktree settings persist safety policy and display status, but full list/create/bind/delete APIs are not implemented in this pass.
- Browser-use settings are real persisted controls with permission semantics, but actual browser runtime integration still depends on the desktop/cloud browser provider wiring.
- Dictation captures hotkeys and reports Web Speech API support, but native desktop speech input is not implemented.
- Usage export currently uses local/projected client data; server-side day/model/provider/device aggregation still needs persistent usage ingestion.
- DOM/mobile browser verification and Mini PC deployment were not performed in this pass.

### Suggested Next Steps

- Add backend MCP/worktree/browser-use APIs and wire them into provider session startup and control-center actions.
- Add server-side usage event aggregation so the Usage page can report all devices/environments instead of local projections.
- Run the responsive DOM verification matrix against a local dev server and the production Mini PC before pushing the website deployment.
- Create and publish a GitHub release using `release/V3-Code-0.0.25-x64.exe` after repository credentials and release tag are confirmed.

## [2026-04-29] - Multi-Agent Workspace, Cloud Login/Admin, Windows Release

### What Was Implemented

- Added a multi-agent chat workspace that supports single-pane, left/right, up/down, and four-quarter layouts.
- Added pane-level chat targeting so any pane can open old, active, archived, or cross-device chats.
- Added device-hosted and cloud-environment chat starts from the multi-chat empty pane flow.
- Added a cloud login page that uses the existing Google OAuth browser flow and server redirect endpoints.
- Expanded the admin page with Live chats and Devices tabs for cross-device chat visibility and controls.
- Protected the cloud admin route so unauthenticated `/app/admin` visits land on the Google login surface.
- Added host-device propagation when starting threads so chats can be associated with a selected device.
- Fixed Windows packaging metadata so the NSIS release build can generate update files reliably.
- Fixed the cloud web build helper so Windows Bun installs that expose `bun.exe` but not `bun.cmd` can build.
- Recreated `release.exe` with the fresh Windows installer artifacts.
- Deployed the server-node website to the Mini PC at `C:\v3code` and verified the NSSM service is running.
- Made Windows test portability fixes so the full root verification suite passes on this machine.

### Files Modified

- `apps/web/src/multiChatLayoutStore.ts` - persisted pane layout and pane target state.
- `apps/web/src/components/multiChat/MultiChatWorkspace.tsx` - multi-pane workspace UI and pane actions.
- `apps/web/src/routes/_chat.index.tsx` - renders the multi-chat workspace on the chat home route.
- `apps/web/src/routes/_chat.$environmentId.$threadId.tsx` - renders route chats inside the multi-chat workspace.
- `apps/web/src/hooks/useHandleNewThread.ts` - accepts host device selection when creating drafts.
- `apps/web/src/lib/chatThreadActions.ts` - forwards host device and folder context through thread creation.
- `apps/web/src/lib/startThreadFromFolder.ts` - shared folder-to-thread start helper.
- `apps/web/src/components/HomeComposer.tsx` - reuses the shared folder start helper.
- `apps/web/src/components/ChatView.tsx` - forwards host device context during thread bootstrap.
- `apps/web/src/routes/login.tsx` - Google OAuth login page for the cloud/server-node web surface.
- `apps/web/src/routes/_chat.tsx` - cloud unauthenticated users redirect to `/login`.
- `apps/web/src/routes/pair.tsx` - cloud unauthenticated pairing redirects to `/login`.
- `apps/web/src/routes/__root.tsx` - keeps toast providers available for unauthenticated cloud pages.
- `apps/web/src/routes/admin.tsx` - added Live chats and Devices controls to admin.
- `apps/web/src/routeTree.gen.ts` - regenerated TanStack route tree.
- `scripts/build-web-cloud.ts` - uses the Bun lifecycle executable when available and handles spawn errors.
- `scripts/build-desktop-artifact.ts` - includes repository metadata in staged Electron package.
- `package.json` - added repository metadata for release/updater tooling.
- `apps/web/package.json` - made web Vitest execution Windows-safe.
- `packages/effect-acp/package.json` - increased test timeout for slower Windows runs.
- `apps/server/**/*.test.ts` - Windows path, shell wrapper, CRLF, and process-behavior portability fixes.

### Assumptions Made (flag these for review)

- The Mini PC deployment target is the existing `C:\v3code` NSSM-managed server.
- The existing Google OAuth server endpoints are the intended OAuth redirect surface for `v3.agaminggod.com`.
- The production web control surface is the cloud bundle under `/app`, with `/login` hosted at the root.
- Cloud environment creation should surface existing server capabilities and fail gracefully when the backend is not configured.

### Known Issues / Deferred

- Mobile layout was DOM-verified through responsive markup and desktop browser inspection; the local Playwright mobile run could not use the bundled browser because the Playwright browser binary is not installed on this machine.
- The admin Live chats page can issue control commands only when the browser has an authenticated server-node session.
- The Windows installer is unsigned unless the Azure Trusted Signing environment is configured.
- The previous Mini PC deployment was backed up at `C:\v3code-backup-20260429220016`.

### Suggested Next Steps

- Configure the production Google OAuth client redirect URI for `https://v3.agaminggod.com/api/auth/google/callback`.
- Add a focused browser test that asserts the mobile pane selector at a mobile viewport once Playwright browsers are installed in CI.
- Wire cloud environment status details into the Live chats table after the cloud container backend is fully enabled.

## [2026-04-30] - Production Pairing Redirect Repair

### What Was Implemented

- Added a server-node-only HTTP redirect so public `/pair` requests go to `/login` instead of serving the legacy pairing app.
- Added a unit test that preserves local `web`/`desktop` pairing behavior while enforcing the server-node redirect.
- Rebuilt and redeployed the Mini PC server after verifying the public route mismatch.

### Files Modified

- `apps/server/src/http.ts` - redirects `/pair` to `/login` when the runtime mode is `server-node`.
- `apps/server/src/http.test.ts` - covers the mode-specific redirect predicate.
- `PROJECT_LOG.md` - records the production redirect repair and deployment verification.

### Assumptions Made (flag these for review)

- Public `server-node` deployments should not expose the one-time pairing UI at `/pair`; Google OAuth at `/login` is the only public web login path.
- Local `web` and `desktop` modes still need `/pair` for loopback/manual pairing flows.

### Known Issues / Deferred

- `/control` still renders an unauthenticated shell and receives a 401 for protected data until the user signs in; this is expected for now.

### Suggested Next Steps

- Add an end-to-end HTTP route test around the full server router once the test harness can cheaply construct `ServerConfig` in `server-node` mode.

## [2026-05-01] - Main Release CI Test Repair

### What Was Implemented

- Fixed Cursor ACP shutdown tests so they count wrapper process exits instead of every nested mock-agent `SIGTERM` entry.
- Made Cursor ACP test wrappers invoke `bun.exe` directly on Windows instead of routing `bun.cmd` through a shell.
- Isolated the WorkspaceEntries filesystem cache-dedup test from the Git-backed index path.
- Made GitCore and GitManager temp directories use a Windows system temp root when the user temp directory is itself inside a Git worktree.

### Files Modified

- `apps/server/src/provider/Layers/CursorAdapter.test.ts` - tightened ACP wrapper exit assertions and made mock wrapper spawning Windows-safe.
- `apps/server/src/provider/Layers/CursorProvider.test.ts` - tightened ACP probe exit assertions and made mock wrapper spawning Windows-safe.
- `apps/server/src/git/Layers/CursorTextGeneration.test.ts` - made Cursor text-generation mock wrapper spawning Windows-safe.
- `apps/server/src/workspace/Layers/WorkspaceEntries.test.ts` - moved the filesystem cache-dedup assertion to a filesystem-only layer and normalized path comparisons.
- `apps/server/src/git/Layers/GitCore.test.ts` - creates scoped test repositories outside user temp worktrees on Windows.
- `apps/server/src/git/Layers/GitManager.test.ts` - creates scoped test repositories outside user temp worktrees on Windows.
- `PROJECT_LOG.md` - records the CI repair and verification.

### Assumptions Made (flag these for review)

- The current failing GitHub Actions scope is the scheduled `Release` workflow on `main`.
- Counting `wrapper:SIGTERM` is the intended assertion for ACP runtime wrapper cleanup; nested mock-agent signal logs are incidental test-fixture noise.

### Known Issues / Deferred

- `bun lint` still reports 26 pre-existing warnings, but exits with 0 errors.

### Suggested Next Steps

- Push the repaired `main` changes and rerun the `Release` workflow to verify GitHub Actions is green.

## [2026-05-01] - Main CI Android and Browser Repair

### What Was Implemented

- Imported Capacitor Android `variables.gradle` from the project-level Gradle file so `compileSdkVersion`, `minSdkVersion`, and `targetSdkVersion` are available to the app module during CI.
- Fixed Android adaptive launcher icon foreground references so resource linking can find the existing drawable vector.
- Fixed the Android splash-screen animated icon reference so resource linking no longer looks for a missing `mipmap` foreground resource.
- Updated the browser WebSocket RPC harness for the mesh chat/presence/prompt streams and multiple browser clients.
- Updated ChatView browser fixtures to send mesh chat snapshots and route mesh prompt dispatch through the existing orchestration assertions.
- Made desktop bootstrap reads tolerate partial desktop bridge objects.
- Made LocalApi desktop bridge persistence and shell helpers fall back per method instead of assuming every bridge method exists.
- Made the import-chat dialog avoid resolving a primary environment while closed.
- Hardened SettingsPanels and ChatMarkdown browser fixtures against cross-file partial `nativeApi` state.
- Hoisted the SettingsPanels browser runtime mock so Vitest browser mode can resolve the mock factory reliably in CI.
- Prebundled `react-dom/client` for Vite browser tests so dependency optimization does not reload the Vitest browser connection mid-run.
- Added browser-test setup that suppresses Chromium's known ResizeObserver loop notification so it does not close the Vitest browser RPC connection in CI.
- Serialized Vitest browser spec files to avoid CI-only browser RPC closure while heavy ChatView browser tests run concurrently with other mocked browser specs.
- Split browser specs into separate Vitest browser processes to avoid CI failing the entire browser suite on a teardown-time browser RPC mock rejection after all assertions pass.
- Passed the configured npm publish token into the release workflow's CLI publish step and added an explicit missing-secret check.

### Files Modified

- `apps/mobile/android/build.gradle` - loads Android SDK version variables for CI Gradle builds.
- `apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` - points the adaptive icon foreground at the existing drawable resource.
- `apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` - points the round adaptive icon foreground at the existing drawable resource.
- `apps/mobile/android/app/src/main/res/values/styles.xml` - points the splash-screen animated icon at the existing drawable resource.
- `apps/web/test/wsRpcHarness.ts` - supports per-client RPC server instances and mesh stream methods in browser tests.
- `apps/web/src/components/ChatView.browser.tsx` - updates browser test fixtures for mesh chat snapshots and prompt dispatch.
- `apps/web/src/components/KeybindingsToast.browser.tsx` - passes the active browser WebSocket client into the shared harness.
- `apps/web/src/environments/primary/auth.ts` - safely reads optional desktop bootstrap credentials.
- `apps/web/src/environments/primary/target.ts` - safely reads optional desktop bootstrap target data.
- `apps/web/src/localApi.ts` - falls back when partial desktop bridges omit optional methods.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - defers primary environment lookup until the dialog is open.
- `apps/web/src/components/settings/SettingsPanels.browser.tsx` - wraps settings fixtures in query context, mocks aliased runtime imports, and keeps the runtime mock browser-safe.
- `apps/web/src/components/ChatMarkdown.browser.tsx` - completes the native API fixture shape used by shared browser tests.
- `apps/web/vite.config.ts` - prebundles the React DOM browser entry used by Vitest browser rendering.
- `apps/web/vitest.browser.config.ts` - loads the browser-test setup file before browser specs and runs browser spec files serially.
- `apps/web/scripts/run-browser-tests.ts` - discovers browser spec files and runs each in its own Vitest browser process.
- `apps/web/package.json` - routes `test:browser` through the per-file browser runner.
- `.github/workflows/release.yml` - supplies `NODE_AUTH_TOKEN` to npm publish and fails clearly when `NPM_TOKEN` is not configured.
- `apps/web/src/test/browserSetup.ts` - filters the known ResizeObserver loop notification during browser tests.
- `PROJECT_LOG.md` - records the Android and browser CI repair.

### Assumptions Made (flag these for review)

- The CI Android runners provide a valid Android SDK, so the local Gradle error after project evaluation is environmental rather than a repository failure.
- The mesh stream methods are the intended browser test surface for current ChatView runtime behavior.

### Known Issues / Deferred

- Local `:app:assembleDebug` cannot complete on this Windows machine because no Android SDK path is configured.
- `bun lint` still reports 26 warnings but exits with 0 errors.
- Browser tests still print existing router-context, ResizeObserver, and RPC subscription warning noise while exiting successfully.

### Suggested Next Steps

- Watch the new `main` push GitHub Actions run and confirm both CI and mobile smoke jobs complete successfully.

## [2026-05-06] - Audit Finding Repairs

### What Was Implemented

- Fixed Cursor ACP Windows tests by spawning the active Bun executable instead of assuming `bun.exe` is directly on PATH.
- Made chat import detection stricter so unsupported JSON/JSONL is rejected instead of guessed as Codex or Anthropic.
- Kept local scanned imports provider-bounded by parsing ready scan entries with their scanned provider format.
- Prevented Anthropic Console local scans from marking arbitrary Downloads JSON/JSONL files as importable.
- Made auto fallback use the atomic bootstrap `thread.turn.start` path, persist trigger markers, and avoid duplicate visible fallback threads.
- Scoped auto fallback usage-limit detection to the latest turn's provider rate-limit/runtime-error activity.
- Made Usage CSV's "include prompt/message text" setting affect exported rows.
- Fixed Windows titlebar-overlay padding `calc(...)` classes so top-right controls reserve valid space.
- Added tracked null embedded auth defaults and switched desktop GitHub/Google code away from the example config module.
- Gave nightly desktop builds a distinct app id and runtime app identity.
- Preserved ACP child stderr in process-exit errors so spawn failures are diagnosable.

### Files Modified

- `.gitignore` - keeps private local embedded auth overrides ignored while allowing tracked null defaults.
- `apps/desktop/src/embeddedAuthConfig.ts` - tracked null OAuth defaults; no client IDs or secrets committed.
- `apps/desktop/src/embeddedAuthConfig.example.ts` - updated credential guidance to avoid tracked secrets.
- `apps/desktop/src/main.ts` - imports tracked auth defaults and separates nightly app identity.
- `apps/desktop/src/v3GitHubAuth.ts` - resolves GitHub device-flow client id from the tracked auth config path.
- `apps/desktop/src/v3GoogleAuthFlow.ts` - resolves Google embedded secret from the tracked auth config path.
- `apps/desktop/src/v3ChatImportCore.ts` - validates scanned transcript formats and blocks arbitrary Anthropic JSON imports.
- `apps/desktop/src/v3ChatImportCore.test.ts` - covers provider-specific scan detection and arbitrary JSON rejection.
- `apps/server/src/git/Layers/CursorTextGeneration.test.ts` - uses `process.execPath` for the Bun mock agent.
- `apps/server/src/provider/Layers/CursorAdapter.test.ts` - uses `process.execPath` for the Bun mock agent.
- `apps/server/src/provider/Layers/CursorProvider.test.ts` - uses `process.execPath` for the Bun mock agent.
- `apps/web/src/components/AutoFallbackCoordinator.tsx` - adds durable trigger markers and atomic fallback thread creation.
- `apps/web/src/lib/providerUsage.ts` - scopes limit snapshots and fallback signals to the active turn.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - parses scanned transcripts with the scanned provider format.
- `apps/web/src/components/settings/UsageSettings.tsx` - exports message text when the CSV setting is enabled.
- `apps/web/src/components/ChatView.tsx` - fixes titlebar-overlay padding calc syntax.
- `apps/web/src/components/DiffPanelShell.tsx` - fixes titlebar-overlay padding calc syntax.
- `apps/web/src/components/NoActiveThreadState.tsx` - fixes titlebar-overlay padding calc syntax.
- `apps/web/src/components/multiChat/MultiChatWorkspace.tsx` - fixes titlebar-overlay padding calc syntax.
- `apps/web/src/routes/settings.tsx` - fixes titlebar-overlay padding calc syntax.
- `packages/effect-acp/src/_internal/stdio.ts` - captures child stderr tail for process-exit diagnostics.
- `packages/effect-acp/src/errors.ts` - includes optional stderr detail in ACP process-exit errors.
- `packages/shared/src/chatImport/detect.ts` - removes broad fallback guessing and requires recognizable transcript shapes.
- `packages/shared/src/chatImport/chatImport.test.ts` - covers unsupported JSON/JSONL detection rejection.
- `scripts/build-desktop-artifact.ts` - emits a distinct nightly app id.
- `scripts/build-desktop-artifact.test.ts` - covers nightly app id resolution.

### Assumptions Made (flag these for review)

- Provider-specific local scans should list recognized unsupported providers but only allow import for tested parsers.
- Anthropic Console JSON exports include role-bearing message objects near the start of the file.
- Persisting auto fallback trigger keys in localStorage is sufficient client-side dedupe until a server-side idempotency contract exists.
- Stable and nightly should share user data for now; only OS app identity and packaging id were separated.

### Known Issues / Deferred

- `bun lint` still reports 26 pre-existing warnings but exits with 0 errors.
- GitHub device flow still requires the user, environment, or build pipeline to provide a public OAuth client ID.
- Exact provider quota remaining is still displayed only when the provider reports it.
- Full packaged Windows icon/AppUserModelID behavior still needs verification on an installed artifact.

### Suggested Next Steps

- Add server-side idempotency for auto fallback source thread/activity pairs.
- Add packaged Windows install verification for stable/nightly side-by-side taskbar behavior.
- Add desktop IPC tests for the GitHub device-flow client-id resolution path.
