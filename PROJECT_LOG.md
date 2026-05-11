## [2026-05-11] - Main CI Browser Test Repair

### What Was Implemented

- Fixed the ChatComposer slash-command menu so it is not clipped by the
  rounded composer surface while open.
- Verified the failing browser test now hit-tests the visible menu item
  instead of the message timeline behind it.

### Files Modified

- `apps/web/src/components/chat/ChatComposer.tsx` - switches the
  composer surface to visible overflow only while the command menu is
  open.
- `PROJECT_LOG.md` - records this browser CI repair pass.

### Assumptions Made (flag these for review)

- The composer surface should keep rounded clipping in normal states and
  relax overflow only for the command menu popover.

### Known Issues / Deferred

- Browser tests still print existing ResizeObserver and mock RPC warning
  noise while passing.

### Suggested Next Steps

- Watch the refreshed main CI run to confirm the full browser-test step
  passes on GitHub Actions.

## [2026-05-11] - Main CI Test Repair

### What Was Implemented

- Updated server test expectations for the orchestrator read-model fields
  and the new Postgres migration entry after the orchestrator merge.

### Files Modified

- `apps/server/src/orchestration/projector.test.ts` - expects
  `sessionMode` and `orchestratorConfig` on projected threads.
- `apps/server/src/persistence/PostgresMigrations.test.ts` - includes
  `OrchestratorSessionMode` in the migration-name sequence.
- `PROJECT_LOG.md` - records this CI test repair pass.

### Assumptions Made (flag these for review)

- The projector behavior is correct; the failing test was an outdated
  exact-object expectation.
- Migration 034 is part of the upstream-port sequence for Postgres
  migration registry tests.

### Known Issues / Deferred

- Broader scheduled release workflow failures visible in GitHub Actions
  predate this orchestrator CI repair and were not part of this fix.

### Suggested Next Steps

- Watch the refreshed main CI run through browser tests and desktop build
  after this patch lands.

## [2026-05-11] - Orchestrator PR CI Repair

### What Was Implemented

- Removed accidental `ModelRunStats` references from the orchestrator PR's
  `ChatView.tsx` changes so the PR no longer depends on unrelated local
  unstaged files.
- Kept the orchestrator PR scoped instead of adding the separate
  model-run-stats feature files to the branch.

### Files Modified

- `apps/web/src/components/ChatView.tsx` - removes accidental
  model-run-stats imports, timeline props, and branch-toolbar slot prop.
- `PROJECT_LOG.md` - records this CI repair pass.

### Assumptions Made (flag these for review)

- The model-run-stats files are a separate local feature and should not
  be pulled into the orchestrator PR just to satisfy missing imports.

### Known Issues / Deferred

- The local working tree still contains unrelated unstaged changes that
  are intentionally left out of the PR.

### Suggested Next Steps

- Let the refreshed PR checks run and verify the main CI plus mobile
  smoke jobs are green.

## [2026-05-11] - Orchestrated Session Feature

### What Was Implemented

- Added schema-only orchestrator configuration contracts with free-form
  provider model, effort, and mode fields.
- Added the `packages/agent-harness` workspace with CLI process,
  routing, session, and task queue primitives for future multi-process
  runtime adapters.
- Wired orchestrated session mode through the current V3 orchestration
  event log, projection threads, settings state, WebSocket shells, and
  provider command reactor.
- Added explicit orchestrator task and agent lane events. Providers
  without a dedicated runtime adapter emit a visible fallback lane and
  route through the active provider runtime.
- Added migrations for persisted thread `session_mode` and
  `orchestrator_config_json` in both SQLite and Postgres.
- Added the web orchestrated chat view, Orchestrator settings page,
  route/search/navigation entries, and ProviderModelPicker Orchestrator
  selection.
- Added the Sonnet assistant subagent definition and updated affected
  fixtures for required thread metadata.

### Files Modified

- `.claude/agents/sonnet-assistant.md` - Sonnet assistant subagent
  definition.
- `packages/contracts/src/orchestrator-config.ts` - orchestrator config
  and session-mode schemas.
- `packages/contracts/src/index.ts` - exports orchestrator config
  contracts.
- `packages/contracts/src/settings.ts` - stores saved
  `orchestratorConfig`.
- `packages/contracts/src/orchestration.ts` - adds orchestrator thread
  metadata, commands, and events.
- `packages/agent-harness/package.json` - new workspace package
  manifest.
- `packages/agent-harness/tsconfig.json` - harness TypeScript config.
- `packages/agent-harness/src/CLIProcess.ts` - single CLI process
  wrapper.
- `packages/agent-harness/src/AgentRouter.ts` - role/task router.
- `packages/agent-harness/src/OrchestratorSession.ts` - three-process
  session lifecycle.
- `packages/agent-harness/src/TaskQueue.ts` - task state rebuilt from
  orchestration events.
- `packages/agent-harness/src/index.ts` - harness exports.
- `apps/server/src/persistence/Migrations/034_OrchestratorSessionMode.ts`
  - SQLite migration.
- `apps/server/src/persistence/PostgresMigrations/034_OrchestratorSessionMode.ts`
  - Postgres migration.
- `apps/server/src/persistence/Migrations.ts` - registers migration 034.
- `apps/server/src/persistence/PostgresMigrations.ts` - registers
  Postgres migration 034.
- `apps/server/src/persistence/Layers/ProjectionThreads.ts` - persists
  orchestrator projection fields.
- `apps/server/src/persistence/Services/ProjectionThreads.ts` - adds
  projection row/schema fields.
- `apps/server/src/orchestration/session.ts` - orchestrator prompt and
  turn-input builder.
- `apps/server/src/orchestration/events.ts` - orchestrator event
  publisher helpers.
- `apps/server/src/orchestration/index.ts` - orchestration exports.
- `apps/server/src/orchestration/decider.ts` - handles orchestrator
  commands.
- `apps/server/src/orchestration/projector.ts` - projects orchestrator
  thread metadata.
- `apps/server/src/orchestration/Layers/MeshEventIngestion.ts` - imports
  remote orchestrator metadata/events.
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` - writes
  orchestrator projection fields.
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts` -
  exposes orchestrator fields in snapshots.
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` -
  routes orchestrated turns through the active provider fallback.
- `apps/server/src/cloud/http.ts` - carries orchestrator fields through
  cloud thread shells.
- `apps/server/src/serverRuntimeStartup.ts` - carries orchestrator
  fields during startup projection.
- `apps/server/src/ws.ts` - includes orchestrator fields in WS shells.
- `apps/server/src/orchestration/commandInvariants.test.ts` - fixture
  updates.
- `apps/server/src/orchestration/Layers/OrchestrationEngine.test.ts` -
  fixture updates.
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts`
  - fixture updates.
- `apps/server/src/persistence/Layers/ProjectionRepositories.test.ts` -
  persisted-field coverage.
- `apps/server/src/provider/Layers/ProviderSessionReaper.test.ts` -
  fixture updates.
- `apps/server/src/server.test.ts` - fixture updates.
- `apps/web/src/types.ts` - web thread orchestrator fields.
- `apps/web/src/store.ts` - settings and thread-state persistence.
- `apps/web/src/routeTree.gen.ts` - generated Orchestrator settings
  route.
- `apps/web/src/components/ChatView.logic.ts` - draft bootstrap session
  metadata.
- `apps/web/src/components/ChatView.tsx` - orchestrated rendering and
  persisted turn metadata.
- `apps/web/src/components/chat/ChatComposer.tsx` - forwards selected
  session mode.
- `apps/web/src/components/chat/ProviderModelPicker.tsx` - adds the
  Orchestrator option.
- `apps/web/src/components/OrchestratedSession/AgentBadge.tsx` - agent
  status badge.
- `apps/web/src/components/OrchestratedSession/AgentLane.tsx` - agent
  output lane.
- `apps/web/src/components/OrchestratedSession/TaskQueue.tsx` - task
  queue panel.
- `apps/web/src/components/OrchestratedSession/index.tsx` - three-panel
  orchestrated chat view.
- `apps/web/src/components/settings/OrchestratorSettings/ProviderPicker.tsx`
  - generic provider/model picker.
- `apps/web/src/components/settings/OrchestratorSettings/OrchestratorRoles.tsx`
  - per-role config.
- `apps/web/src/components/settings/OrchestratorSettings/SubAgentConfig.tsx`
  - subagent config editor.
- `apps/web/src/components/settings/OrchestratorSettings/PlanningConfig.tsx`
  - planning controls.
- `apps/web/src/components/settings/OrchestratorSettings/index.tsx` -
  settings page root.
- `apps/web/src/routes/settings.orchestrator.tsx` - settings route.
- `apps/web/src/components/settings/settingsNavigation.ts` - navigation
  entry.
- `apps/web/src/components/settings/settingsSearch.ts` - settings search
  entry.
- `apps/web/src/components/ChatView.logic.test.ts` - fixture updates.
- `apps/web/src/components/CommandPalette.logic.test.ts` - fixture
  updates.
- `apps/web/src/components/Sidebar.logic.test.ts` - fixture updates.
- `apps/web/src/components/ChatView.browser.tsx` - fixture updates.
- `apps/web/src/components/KeybindingsToast.browser.tsx` - fixture
  updates.
- `apps/web/src/environments/runtime/service.threadSubscriptions.test.ts`
  - fixture updates.
- `apps/web/src/store.test.ts` - settings/thread fixture coverage.
- `apps/web/src/lib/threadSort.test.ts` - fixture updates.
- `apps/web/src/worktreeCleanup.test.ts` - fixture updates.
- `bun.lock` - updated after adding the new workspace package.
- `MESH_CHANGES.md` - documents the orchestrator file delta.
- `PROJECT_LOG.md` - records this task.

### Assumptions Made (flag these for review)

- The plan referred to older names like `chats`, `chat_events`,
  `CreateChatPayload`, and `UpdatePreferencesPayload`; this repo now
  uses event-sourced orchestration projections and `ServerSettings`, so
  the feature was added at those current integration points.
- Dedicated runtime adapters for Claude Code, Codex, Gemini, and custom
  providers are not all present yet. The server therefore emits an
  explicit fallback lane and routes the turn through the active provider
  until those adapters are implemented.
- `bun install` was required after adding `packages/agent-harness` so
  the workspace lockfile recognized the new package.

### Known Issues / Deferred

- The new `agent-harness` package is implemented as a standalone
  primitive layer; the server currently uses the existing active
  provider runtime rather than spawning a full three-provider process
  set.
- `bun lint` and `apps/web` build still print existing warning noise,
  but both commands exit successfully.
- Several unrelated files were already dirty in the worktree and were
  left untouched except where the orchestrator feature required edits.

### Suggested Next Steps

- Add concrete runtime adapters that bind provider configs to
  `packages/agent-harness` process definitions.
- Add focused interaction tests for orchestrated lane projection once
  the UI test harness covers the new three-panel view.
- Exercise an orchestrated chat manually against a real provider profile
  to validate the prompt/fallback behavior under streaming output.

## [2026-05-09] - Import Review Summary IPC

### What Was Implemented

- Added a desktop `readSummary` chat-import IPC method that parses a transcript in the Electron main process and returns only review metadata plus message count.
- Changed local transcript review/import preparation to use summary IPC instead of sending full transcript text into the renderer before the user clicks `Import selected`.
- Kept final commit lazy: full transcript content is still loaded one chat at a time only when actually importing.
- Added desktop coverage proving review summaries parse workspace/message metadata without returning raw transcript content.

### Files Modified

- `packages/contracts/src/ipc.ts` - adds `DesktopParsedTranscriptSummary` and the `chatImport.readSummary` bridge contract.
- `apps/desktop/src/v3ChatImportCore.ts` - adds validated summary parsing for ready transcript formats.
- `apps/desktop/src/v3ChatImport.ts` - registers the new IPC channel.
- `apps/desktop/src/preload.ts` - exposes `chatImport.readSummary` to the renderer.
- `apps/desktop/src/v3ChatImportCore.test.ts` - covers summary parsing without content transfer.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - uses `readSummary` during review preparation.
- `apps/web/src/components/settings/SettingsPanels.browser.tsx` and `apps/web/src/localApi.test.ts` - update desktop bridge mocks for the new contract.
- `PROJECT_LOG.md` - records this import hardening pass.

### Assumptions Made (flag these for review)

- Moving review parsing to the desktop main process is the safest next step before a larger server-side streaming importer, because it avoids renderer-side full-text parsing during bulk review without changing the final import RPC contract.

### Known Issues / Deferred

- Final import still sends each parsed chat through the renderer one at a time; a dedicated streaming importer would be needed to keep extremely large single transcripts fully out of the renderer.

### Suggested Next Steps

- Re-run Import All with the rebuilt desktop app and confirm the review screen appears quickly with projects/threads grouped before clicking `Import selected`.
- If one very large transcript still causes pressure during final commit, move the final parse/import loop fully into desktop/server IPC with progress events.

## [2026-05-09] - Phase 3 Live Device Presence

### What Was Implemented

- Wired the mesh presence stream into the device React Query cache so online/offline state updates without waiting for a focus refresh or manual refetch.
- Added a pure presence merge helper that updates known devices only, preserves unchanged device references, and ignores invalid timestamps instead of corrupting last-seen data.
- Added focused tests for presence snapshot updates, live single-device updates, unknown devices, and invalid timestamp handling.

### Files Modified

- `apps/web/src/rpc/meshSubscriptions.ts` - subscribes to `mesh.subscribePresence` and updates `v3DeviceQueryKeys.list()` directly.
- `apps/web/src/rpc/meshPresence.ts` - centralizes presence-to-device-list merge logic.
- `apps/web/src/rpc/meshPresence.test.ts` - covers the live presence merge behavior.
- `PROJECT_LOG.md` - records this Phase 3 completion work.

### Assumptions Made (flag these for review)

- The existing device-first multi-device sidebar and single-device project-first sidebar were the intended Phase 3 baseline; the missing behavior was live presence subscription.

### Known Issues / Deferred

- Presence updates only apply to devices already returned by the server device list; account-discovered installs still need server pairing before they can appear as controllable devices.

### Suggested Next Steps

- Verify with two signed-in installs that a second device flips online/offline in the sidebar without changing pages or focusing the app.

## [2026-05-09] - Phase 1 OpenChrome Browser Automation Setup

### What Was Implemented

- Added typed desktop IPC for OpenChrome status checks, installer execution, and extension setup opening.
- Added a one-time first-boot prompt that asks before enabling browser automation and defers the status probe until browser idle time.
- Added a Browser use settings card to install/repair OpenChrome, refresh bridge status, show MCP/startup/pair-token state, and open the extension setup.
- Added settings search coverage for the OpenChrome MCP bridge under Browser use.
- Built a fresh Windows x64 installer at `C:\Users\lucas\Desktop\V3-Code-0.0.25-x64.exe`.

### Files Modified

- `apps/desktop/src/openChromeSetup.ts` - OpenChrome path resolution, bridge reachability probe, installer runner, and IPC registration.
- `apps/desktop/src/openChromeSetup.test.ts` - coverage for path resolution, status reporting, and extension setup opening.
- `apps/desktop/src/main.ts` - registers OpenChrome IPC.
- `apps/desktop/src/preload.ts` - exposes `desktopBridge.openChrome`.
- `packages/contracts/src/ipc.ts` - adds OpenChrome desktop bridge contracts.
- `apps/web/src/v3/ui/OpenChromeSetupNudge.tsx` - first-boot consent prompt.
- `apps/web/src/routes/__root.tsx` - mounts the prompt.
- `apps/web/src/components/settings/BrowserUseSettings.tsx` - adds OpenChrome install/status controls.
- `apps/web/src/components/settings/settingsSearch.ts` - adds the Browser use search entry.

### Assumptions Made (flag these for review)

- The OpenChrome project lives at `~/projects/claude-in-chrome-clone` unless `V3CODE_OPENCHROME_HOME` overrides it.
- V3 can run the MCP/bridge installer automatically after consent, but normal Chrome policies still require a guided load-unpacked extension step.
- A one-time local prompt is the right first-boot behavior for this phase.

### Known Issues / Deferred

- The Chrome extension is opened as a guided setup page plus selected folder; it is not silently force-installed into the browser profile.
- Broad performance optimization remains a phased effort; this pass kept startup work lazy and bounded but did not profile every subsystem.

### Suggested Next Steps

- Install the rebuilt desktop app, choose `Enable` on the prompt, and load the unpacked extension from the opened folder.
- Confirm Settings > Browser use shows OpenChrome bridge online after the bridge starts.

## [2026-05-09] - Lazy Chat Import Review Crash Fix

### What Was Implemented

- Changed local chat-import review so desktop scans keep only lightweight parsed summaries in React state instead of storing every full transcript body.
- Made final import lazily re-read and parse each selected transcript one at a time, so large Codex/Claude archives do not accumulate multi-GB renderer memory.
- Renamed the staging action to `Prepare import`, changed the staging toast to `Ready to import`, and made the footer say `Close without importing` so users do not mistake the review step for a completed import.
- Added a top-level render error boundary so ordinary React render failures show a recoverable error screen instead of an unexplained blank window.
- Added tests proving import project planning works from summary metadata without full message bodies and that full chat content is loaded lazily during commit.

### Files Modified

- `apps/web/src/components/chat/ImportChatDialog.tsx` - lazy desktop transcript review/import flow, visible parse failures, and clearer staging/close copy.
- `apps/web/src/components/chat/importChatCommit.ts` - commit helper now loads full parsed chats only during per-chat import.
- `apps/web/src/components/chat/importChatCommit.test.ts` - covers summary-only planning and lazy full-transcript loading.
- `apps/web/src/main.tsx` - adds a root render error boundary.
- `PROJECT_LOG.md` - records this crash fix.

### Assumptions Made (flag these for review)

- The blank black screen was caused by renderer memory pressure from reading and storing the whole selected import set before review.
- It is acceptable to re-read/re-parse selected desktop transcripts during final import to keep memory bounded.

### Known Issues / Deferred

- A single extremely large transcript still needs to be parsed and sent during import; this fix bounds memory to one transcript at a time rather than eliminating large single-file cost.
- A renderer process killed by the OS for out-of-memory cannot show the new React error screen; the lazy import path is the prevention for that case.
- The current local database inspection showed no committed `chat.import` events after the user's reported attempt, which means the prior success signal was likely the review-ready staging toast rather than the final commit.

### Suggested Next Steps

- Re-run Import All in the rebuilt desktop app and confirm the review screen appears instead of a black window.
- If individual 100MB+ transcripts still stress the renderer, move transcript parsing into the desktop/server process and stream the resulting import command.

## [2026-05-09] - GitHub Device Flow and Cloud Node Routing

### What Was Implemented

- Switched desktop GitHub connect UI to the existing GitHub Device Flow path so the desktop app no longer requires embedded confidential GitHub OAuth credentials to start sign-in.
- Added one-time device-flow token consumption so the renderer can immediately bootstrap the GitHub token into the authenticated V3 server session.
- Let the server validate and store pre-obtained GitHub tokens even when server-side GitHub OAuth client secrets are not configured.
- Stopped treating `v3.agaminggod.com` as a server-node URL override; the cloud website now opens separately and legacy website overrides are cleared.
- Redirected server-node `/` and `/pair` traffic into the cloud app, and mirrored cloud build assets under `dist-cloud/app` for static `/app/*` hosting.

### Files Modified

- `apps/web/src/v3/ui/ConnectGitHubButton.tsx` - uses desktop Device Flow and bootstraps the resulting token.
- `apps/web/src/v3/ui/GitHubDeviceCodeDialog.tsx` - consumes the completed device-flow token and reports bootstrap failures.
- `apps/desktop/src/v3GitHubAuth.ts` and `apps/desktop/src/preload.ts` - expose one-time device-flow token consumption over the desktop bridge.
- `packages/contracts/src/ipc.ts` and `packages/contracts/src/identity.ts` - update the bridge/auth contracts for the device-flow bootstrap path.
- `apps/server/src/identity/Layers/GitHubIdentityService.ts` - allows `/user` validation without configured OAuth client secrets.
- `apps/server/src/http.ts` - redirects server-node root and legacy pairing routes to the cloud app.
- `apps/web/src/components/settings/ConnectionsSettings.tsx` and `apps/web/src/environments/primary/target.ts` - separate cloud website linking from server-node API overrides.
- `scripts/build-web-cloud.ts`, `apps/web/public/_redirects`, and `deploy/cloudflare-pages/README.md` - make `/app/*` static hosting resolve mirrored cloud assets.

### Assumptions Made (flag these for review)

- Desktop GitHub sign-in should rely on a public GitHub OAuth Client ID via Settings > Git or `V3CODE_GITHUB_PUBLIC_CLIENT_ID`; no client secret should be embedded in the desktop app.
- `v3.agaminggod.com` is the browser cloud website, not the direct server-node API override.

### Known Issues / Deferred

- A real public GitHub OAuth Client ID is still required before GitHub Device Flow can complete.
- Deploying the rebuilt cloud bundle to the live `v3.agaminggod.com` host still depends on the configured hosting credentials.

### Suggested Next Steps

- Deploy the rebuilt cloud bundle/server-node changes to `v3.agaminggod.com`.
- Add a setup-screen check that warns when the live cloud host is serving the non-cloud pairing bundle.

## [2026-05-09] - Transfer Context Menu and Import Status Visibility

### What Was Implemented

- Added `Transfer chat` to the sidebar chat right-click menu and wired it to open the transfer dialog even when the target chat was not already active.
- Made transfer dialog open requests durable across navigation so a context-menu request can navigate to the chat and open the mounted header dialog.
- Added persistent import commit status inside the import dialog, including explicit all-failed/catastrophic failure messages instead of relying only on transient toasts.
- Surfaced transcript read failures in the scan tab itself as well as in a toast.
- Expanded first-install/server-node prompts so users see the sequence: Google sign-in, choose an always-on server-node machine, publish the cloud URL, open `v3.agaminggod.com`, then sign in on other devices.

### Files Modified

- `apps/web/src/components/sidebar/SidebarProjectItem.tsx` - adds the chat-row context-menu transfer action and blocked-state feedback.
- `apps/web/src/components/chat/forkChatOpener.ts` - queues transfer dialog open requests until the matching chat header mounts.
- `apps/web/src/components/chat/ForkChatButton.tsx` - clears queued transfer requests after the dialog opens.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - adds persistent import result/error status and local transcript read error visibility.
- `apps/web/src/components/chat/ConfigureServerBanner.tsx` - turns the server-node banner into a concise setup checklist.
- `apps/web/src/v3/ui/StartupSignInNudge.tsx` - points first-run sign-in guidance toward server-node/cloud setup.
- `PROJECT_LOG.md` - records this implementation pass.

### Assumptions Made (flag these for review)

- The existing transfer dialog remains the intended target-selection UI; the missing piece was the chat-row right-click entry point.
- A visible in-dialog import status is necessary because transient toasts are too easy to miss during bulk imports.
- The first-install tutorial can start as the existing startup nudge plus server-node banner rather than a separate modal wizard.

### Known Issues / Deferred

- The local database still shows no committed import events from the prior failed attempt, so the rebuilt app needs a fresh Import selected run to verify the repaired UI and current-device attribution end to end.
- Full encrypted workspace-folder transfer remains deferred to a dedicated transfer protocol.

### Suggested Next Steps

- Re-run Import All from the rebuilt app and check the persistent status block for exact failure text if any transcript still does not commit.
- Add a dedicated first-run modal only if the banner/toast sequence is still too easy to miss.

## [2026-05-08] - Import Commit Status and Transfer Targeting

### What Was Implemented

- Added a dedicated import commit helper that groups selected Codex/Claude/Anthropic transcripts by normalized workspace path, creates or reuses matching projects, imports every selected chat, and keeps going after per-chat failures.
- Added import progress/status UI, success/failure notifications, and a post-import outcome panel with imported counts, failed entries, and an "open first imported chat" action.
- Stamped imported chats with the current signed-in device so they land under the correct device/project hierarchy instead of relying on sidebar fallback attribution.
- Renamed the fork handoff UI to "Transfer chat" and kept the target device/cloud selector visible for signed-in mesh devices.
- Built a fresh Windows x64 installer at `C:\Users\lucas\Desktop\V3-Code-0.0.25-x64.exe`.

### Files Modified

- `apps/web/src/components/chat/importChatCommit.ts` - shared import commit/project grouping helper with progress and notification summaries.
- `apps/web/src/components/chat/importChatCommit.test.ts` - covers workspace grouping, continued imports after failures, disabled reference filtering, and notification copy.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - wires bulk imports through the commit helper, adds status/failure UI, and stamps current device attribution.
- `apps/web/src/components/chat/ForkChatButton.tsx` - updates the chat handoff dialog to transfer language while keeping target selection.
- `apps/web/src/components/chat/ForkAcceptDialog.tsx` - updates receiving-device folder selection copy for transferred chats.
- `apps/web/src/hooks/useThreadActions.ts` - updates transfer success/error toasts.
- `apps/web/src/environments/runtime/service.ts` - updates incoming transfer notification copy.
- `PROJECT_LOG.md` - records this implementation pass.

### Assumptions Made (flag these for review)

- Import should fail visibly per transcript instead of aborting the whole batch after the first failed project/thread commit.
- Imported chats should be hosted by the current signed-in device when one is available.
- The current mesh chat-copy path is still the right base for chat transfer, with target folder selection handled on the receiving device.

### Known Issues / Deferred

- End-to-end encrypted workspace-folder file bundle transfer is not implemented in this pass; current transfer copies chat context through the authenticated mesh and lets the receiving device choose a local folder.
- Full credential-aware MCP server import and skill management remain part of the broader MCP/skills management work.

### Suggested Next Steps

- Run Import All from the rebuilt desktop app and confirm the outcome panel reports the same Codex/Claude counts as the local scan.
- Add a dedicated encrypted workspace bundle protocol before advertising full folder/file transfer.

## [2026-05-08] - Device Sidebar, Cloud Linking, and Import All Fixes

### What Was Implemented

- Allowed the desktop chat-import IPC validator to accept the `all` provider and made All scan only supported importers.
- Hid parser-pending providers from the import provider picker and All scan results.
- Changed the sidebar so single-device accounts show Projects first, while multi-device accounts show Device > Project > Chat with the current device expanded by default.
- Added an explicit V3 cloud website row that asks for Google sign-in first, explains remote access requirements after sign-in, and saves `https://v3.agaminggod.com` in one click.

### Files Modified

- `apps/desktop/src/v3ChatImport.ts` - accepts `all` as a valid scan provider from the renderer.
- `apps/desktop/src/v3ChatImportCore.ts` - limits All scans to supported local import parsers.
- `apps/desktop/src/v3ChatImportCore.test.ts` - covers the supported-only All scan behavior.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - hides unsupported provider cards/results and clarifies import review copy.
- `apps/web/src/components/sidebar/DeviceGroup.tsx` - supports nested device content and remounts when current/online state changes so defaults apply.
- `apps/web/src/components/sidebar/SidebarProjectItem.tsx` - supports filtering project threads by device.
- `apps/web/src/components/sidebar/SidebarProjectsContent.tsx` - switches between single-device Projects-first and multi-device Device > Project > Chat layouts.
- `apps/web/src/components/settings/ConnectionsSettings.tsx` - adds the Google sign-in/cloud-link guidance and one-click V3 cloud selection.
- `PROJECT_LOG.md` - records this implementation pass.

### Assumptions Made (flag these for review)

- All import should mean all currently supported parsers rather than all recognized transcript products.
- In multi-device mode, current-device projects should remain visible even before they have attributed chats so users can still start local work.

### Known Issues / Deferred

- Full credential-aware MCP config importing is still deferred to the dedicated MCP/skills management work.
- Website remote control still depends on a reachable paired server node; the settings UI now states that requirement.

### Suggested Next Steps

- Verify import All against the local Codex and Claude roots after installing the rebuilt desktop artifact.
- Exercise the sidebar with one and two Google-signed-in devices to confirm the hierarchy feels right.

## [2026-05-07] - Bulk Import, Cloud Link, Composer UI, and Model Specs

### What Was Implemented

- Added an opt-in detailed model specs setting under Usage.
- Added per-assistant-response stats for completed model runs and a chat aggregate stats strip between the folder mode and branch controls.
- Added weekly and monthly usage bar charts in Usage settings using completed run telemetry.
- Reworked the composer footer so the context meter and send button sit in a stable centered action row and the composer surface keeps rounded lower corners.
- Made the local import scanner support an explicit All provider mode in the dialog while preserving the Codex default for the lower-level desktop API.
- Added bulk transcript review with per-chat toggles, workspace-path project grouping, and skill/MCP reference toggles before import.
- Added a V3 cloud shortcut for `https://v3.agaminggod.com` in the server-node URL override controls.
- Built a fresh Windows x64 NSIS installer at `C:\Users\lucas\Desktop\V3-Code-0.0.25-x64.exe`.

### Files Modified

- `packages/contracts/src/settings.ts` - adds the detailed model specs usage setting.
- `apps/web/src/lib/modelRunStats.ts` - derives per-run, chat, weekly, and monthly model usage stats.
- `apps/web/src/components/chat/ModelRunStats.tsx` - renders assistant-run and chat aggregate stat chips.
- `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, and `apps/web/src/components/BranchToolbar.tsx` - wires model specs into messages and the bottom toolbar.
- `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/chat/ContextWindowMeter.tsx`, and `apps/web/src/components/chat/ComposerPrimaryActions.tsx` - centers footer actions and improves the send button.
- `apps/web/src/components/settings/UsageSettings.tsx` - adds the setting, aggregate cards, and weekly/monthly charts.
- `packages/contracts/src/ipc.ts`, `apps/desktop/src/v3ChatImportCore.ts`, and `apps/web/src/components/chat/ImportChatDialog.tsx` - adds all-provider scan support and bulk import review.
- `apps/web/src/components/settings/ConnectionsSettings.tsx` - adds the V3 cloud URL shortcut.
- `PROJECT_LOG.md` - records this implementation pass.

### Assumptions Made (flag these for review)

- The desktop import dialog should default to scanning all known local provider roots, but the desktop core API should keep its existing Codex default for compatibility.
- Selected imports should require a parsed workspace path instead of silently falling back to an unrelated project.
- Skills and MCPs referenced by transcripts should be reviewed as references first; credentials still stay in the existing MCP settings flow rather than being copied blindly from foreign configs.
- Detailed model stats can only show values that are available from provider events and message timing; unsupported providers or old sessions may show partial metrics.

### Known Issues / Deferred

- `bun lint` still reports 26 pre-existing warnings but exits with 0 errors.
- Some provider formats are still listed as unsupported until a tested parser exists.
- Import review toggles skill/MCP references in imported transcripts; full credential-aware MCP config importing remains a follow-up.

### Suggested Next Steps

- Verify the bulk import review against a real Codex and Claude history folder and confirm the project grouping matches the desired workspace names.
- Add credential-aware MCP config import once the desired secret handling policy is finalized.

## [2026-05-07] - Chat Startup, Import, Devices, and Split Drag Fixes

### What Was Implemented

- Fixed mesh local prompt publishing for new chats by expanding bootstrap turn starts into thread creation plus turn start.
- Replaced the home-page multi-agent workspace with the normal start-chat state.
- Added sidebar chat drag data and drop zones that split the current chat left, right, above, or below without surfacing a dedicated multi-agent feature on the home page.
- Corrected settings search results so Chat import resolves to Personalization.
- Updated chat import parsing for current Codex JSONL sessions and workspace-root aware imports for Codex, Claude, and Anthropic exports.
- Made imported chats attach to or create the parsed transcript workspace project instead of defaulting to the first project.
- Displayed Drive-discovered Google signed-in installs in sidebar device groups and Devices settings with clear offline/not-paired status.
- Re-enabled Windows executable resource editing in the desktop artifact build so the V3 icon can be stamped into desktop/start-menu shortcuts.

### Files Modified

- `apps/server/src/orchestration/Layers/MeshEventIngestion.ts` - handles mesh bootstrap turn starts.
- `apps/web/src/components/multiChat/MultiChatWorkspace.tsx` and `apps/web/src/multiChatDrag.ts` - add unobtrusive chat drag/drop split support.
- `apps/web/src/components/sidebar/SidebarThreadRow.tsx` - makes sidebar chats draggable.
- `apps/web/src/routes/_chat.index.tsx` - restores the normal no-active-chat home state.
- `apps/web/src/components/settings/settingsSearch.ts` - fixes settings search paths and labels.
- `apps/web/src/components/chat/ImportChatDialog.tsx` - routes imports to transcript workspace projects.
- `packages/contracts/src/chatImport.ts` and `packages/shared/src/chatImport/*` - add workspace-root parsing and current Codex JSONL support.
- `apps/web/src/hooks/useChatsByDevice.ts` and `apps/web/src/components/settings/DevicesSettingsPanel.tsx` - show Google signed-in devices, including offline Drive-only installs.
- `scripts/build-desktop-artifact.ts` - lets Electron Builder stamp the Windows executable icon.

### Assumptions Made (flag these for review)

- Drive-only devices are not live mesh clients, so they should render as offline/not paired until they connect to this server node.
- Mesh bootstrap worktree preparation should stay on the existing local UI dispatch path until a full mesh-safe worktree bootstrap path is implemented.

### Known Issues / Deferred

- `bun lint` still reports 26 pre-existing warnings but exits with 0 errors.
- Windows desktop/start-menu icon behavior requires rebuilding and installing a new desktop artifact to verify against Explorer's icon cache.

### Suggested Next Steps

- Rebuild the Windows desktop artifact and reinstall it to confirm Explorer shows the stamped V3 icon after cache refresh.

## [2026-05-07] - Fresh Main Install

### What Was Implemented

- Backed up the previous local `V3 code` directory before replacing it.
- Cloned the latest `main` branch from `https://github.com/aGamingGod1234/v3code.git`.
- Installed dependencies with `bun install --frozen-lockfile`.

### Files Modified

- `PROJECT_LOG.md` - recorded the install and recovery steps required by the workspace agent instructions.

### Assumptions Made (flag these for review)

- Used `main` as confirmed by the user.
- Used the lockfile-provided dependency versions rather than upgrading packages beyond the repository state.

### Known Issues / Deferred

- Stopped two `bun.exe` and two `claude.exe` processes that had the old project folder open.
- The previous local project remains available at `C:\Users\lucas\Desktop\Projects\V3 code.backup-20260507-124537`.

### Suggested Next Steps

- Run the app with the repo script appropriate for the workflow, such as `bun run dev` or `bun run start:desktop`.
- Use `git pull` from `C:\Users\lucas\Desktop\Projects\V3 code` going forward; the clone now tracks `origin/main`.

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
