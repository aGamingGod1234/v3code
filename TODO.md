# TODO

Pointers for upcoming V3 work. Anything load-bearing lives in
[V3_CODE_SPEC.md](./V3_CODE_SPEC.md); issues get tracked on
[GitHub](https://github.com/aGamingGod1234/v3code/issues).

## Phase 11 finish line (done in this branch)

- [x] Write `ghcr.io/v3-code/cloud-env:latest` publish workflow
      ([publish-cloud-env.yml](./.github/workflows/publish-cloud-env.yml)).
      Runs on push to `main`, on tagged release, and on manual
      dispatch; smoke-tests the image for Node/git/Python/uv/claude/
      codex/rg/fd/bat/jq before marking the job green.
- [x] Mobile build smoke in CI
      ([ci.yml `mobile_smoke`](./.github/workflows/ci.yml)) — every
      PR now runs a debug Android APK build so broken
      Capacitor/Gradle pipelines fail before a tag cut fires the
      real release flow.
- [x] v0.1.0 release prep — [scripts/cut-release.ts](./scripts/cut-release.ts)
      bumps package.jsons, refreshes the lockfile, runs the gate,
      commits, and tags; [release notes template](./docs/release-notes-v0.1.0.md)
      ships alongside.
- [x] `[limits].max_devices_per_user` enforcement at the Google
      bootstrap chokepoint with typed `DeviceLimitReachedError`.
- [x] `[limits].max_chats_per_user` enforcement on `thread.create`
      via `mesh.publishEvent`.
- [x] Proactive Google ID-token refresh scheduler so long-lived tabs
      don't drop to the sign-in dialog at ~1 h.
- [x] "Open on another device" action in the offline-host toast.
- [x] Cloudflare Workers + D1 + R2 + Containers deploy template
      ([deploy/cloudflare-workers/](./deploy/cloudflare-workers/)).

## Release blockers still on you

- [ ] Run `node scripts/cut-release.ts 0.1.0` on a clean `main` and
      push the resulting commit + tag.
- [ ] Record the marketing demo video (multi-device handoff + Cloud
      env chat committing to GitHub). Can't be code-generated.
- [ ] Cloudflare provisioning (DNS record + tunnel config pointed at
      v3code.com). Claude-in-Chrome step, not a code task.
- [ ] Register production OAuth redirect URIs with Google + GitHub
      once the Fly/VPS public URL is locked in.

## Known spec gaps (non-blocking, post-launch)

- Cloudflare Containers lifecycle adapter is behind a feature flag;
  the Worker template deploys but Cloud env chats fall through to
  "not available" until the Containers beta goes GA.
- Server-node export/import (spec §14.7) — not yet built. If you
  outgrow your Mini PC you can't seamlessly migrate to a VPS.
- No cross-disconnect message queueing. Spec §6.4 flags this as
  explicitly-not-in-V1 ("per design decision: no queueing in V1").
  The offline-host toast + "Open on another device" action cover
  the UX gap for now. Revisit once we see telemetry on how often
  users actually hit offline hosts.
- iOS build. Android is in Play Store internal testing; iOS waits on
  the Capacitor iOS target landing.

## Smaller ergonomics

- [ ] "Open on another device" currently opens the fork dialog.
      Consider a one-click "fork to this device" when the viewer is
      online and approved.
- [ ] Admin panel — Postgres stats tab still reads "coming soon"
      when no PG connection is configured; clarify the copy.
- [ ] Electron auto-updater smoke against the mock update server
      before the v0.1.0 tag.
