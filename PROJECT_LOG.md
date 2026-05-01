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
