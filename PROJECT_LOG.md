## [2026-04-29] - V3 Code desktop release update

### What Was Implemented

- Added the active-tree guard and pre-commit hook to block edits under the stale outer tree.
- Reworked desktop chat import around session-scoped opaque transcript IDs, bounded Codex recursion, flat Claude project scanning, lazy previews, and manual folder scan support.
- Added GitHub Device Flow authentication in the Electron main process with secure local token storage and renderer-safe IPC/status APIs.
- Replaced the empty-thread state with a folder-aware Home Composer that can create/register projects and start runs from a selected cwd.
- Added named theme support, accent override handling, Appearance settings, Configuration settings, Personalization settings, Git settings, and stub settings tabs.
- Added spawn discovery IPC and settings support for runtime-discovered terminal/environment options.
- Bumped releasable package versions to 0.0.25.
- Built the Windows x64 NSIS installer into `release.exe/`.
- Updated the desktop artifact builder so unsigned Windows builds can complete on non-admin Windows shells.

### Files Modified

- `.gitignore` - ignored generated `dist-cloud` and local `release.exe` artifacts.
- `.githooks/pre-commit` - added active-tree guard hook.
- `package.json` - added active-tree scripts.
- `scripts/assert-active-tree.ts` and `scripts/assert-active-tree.test.ts` - added stale-tree protection.
- `scripts/build-desktop-artifact.ts` and `scripts/build-desktop-artifact.test.ts` - added Windows packaging fallback and V3 branding expectations.
- `apps/desktop/package.json`, `apps/server/package.json`, `apps/web/package.json`, `packages/contracts/package.json` - bumped release versions to 0.0.25.
- `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/v3ChatImport.ts`, `apps/desktop/src/v3ChatImportCore.ts`, `apps/desktop/src/v3ChatImport*.test.ts` - rewired chat import IPC and scanner behavior.
- `apps/desktop/src/v3GitHubAuth.ts` - added main-process GitHub Device Flow implementation.
- `apps/desktop/src/spawnDiscovery.ts` - added runtime environment/shell discovery.
- `packages/contracts/src/ipc.ts`, `packages/contracts/src/settings.ts`, `packages/contracts/src/mesh/chat.ts` - extended shared contracts for new IPC/settings shapes.
- `apps/web/src/components/HomeComposer.tsx`, `apps/web/src/components/NoActiveThreadState.tsx`, `apps/web/src/composerDraft*`, `apps/web/src/hooks/useHandleNewThread.ts` - added folder/cwd start flow.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - added session-scoped local import UX, manual folder scan, debug footer, and progressive row loading.
- `apps/web/src/v3/auth/githubBridge.ts`, `apps/web/src/v3/ui/GitHubDeviceCodeDialog.tsx`, `apps/web/src/v3/ui/ConnectGitHubButton.tsx` - added renderer GitHub Device Flow UI.
- `apps/web/src/hooks/useTheme.ts`, `apps/web/src/index.css`, `apps/web/src/themes/*` - added named themes and accent override.
- `apps/web/src/components/settings/*`, `apps/web/src/routes/settings.*.tsx`, `apps/web/src/routeTree.gen.ts` - added new settings panels/routes and navigation.
- `apps/web/src/localApi.test.ts`, `apps/web/src/components/settings/SettingsPanels.browser.tsx`, `apps/desktop/src/clientPersistence.test.ts` - updated mocks/tests for new settings and bridge contracts.
- `vitest.config.ts` - excluded `node_modules` from test discovery.

### Assumptions Made (flag these for review)

- Used `0.0.25` as the next release version because the latest existing tag is `v0.0.24`.
- Published the `.exe` as a GitHub Release asset instead of committing `release.exe/`, because the installer is larger than GitHub's normal repository blob limit.
- Built an unsigned local Windows installer. Signed Windows CI/release builds can still enable signing explicitly.

### Known Issues / Deferred

- `bun run test` is not green on this Windows machine. The server suite reports pre-existing Windows/environment failures such as `mkfifo` missing, `C:\dev\null`, CRLF newline expectations, temp CLI executable resolution, and Windows permission checks.
- `bun lint` exits successfully but still reports existing warnings.
- The unsigned local Windows build skips electron-builder's combined sign/edit executable step to avoid the winCodeSign symlink extraction failure on non-admin Windows shells.
- Full-access run confirmation modal is implemented but still needs final dispatcher integration.

### Suggested Next Steps

- Fix or platform-gate the Windows-incompatible server tests so `bun run test` is green on Windows.
- Run a signed Windows build in CI or an elevated/dev-mode Windows shell if PE resource signing/editing is required.
- Complete the remaining settings extraction from the legacy Connections page.
- Wire the Full Access confirmation modal into the actual run-start dispatcher.
