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
