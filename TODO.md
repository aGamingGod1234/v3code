# TODO

Pointers for upcoming V3 work. Anything load-bearing lives in
[V3_CODE_SPEC.md](./V3_CODE_SPEC.md); issues get tracked on
[GitHub](https://github.com/aGamingGod1234/v3code/issues).

## Release blockers (Phase 11)

- [ ] Cut the first public `v0.1.0` tag and let CI build the desktop
      artefacts against the cleaned-up README + marketing site.
- [ ] Publish the `ghcr.io/v3-code/cloud-env:latest` image from
      `apps/cloud-env-image/Dockerfile` so Cloud env chats don't pull a
      404 on first use.
- [ ] Record a short demo video for the marketing site (multi-device
      handoff, Cloud env chat committing to GitHub).
- [ ] Shake out the Android internal-testing build against the
      refreshed FCM push config (spec §8.6).

## Known gaps vs the spec (non-blocking for v0.1)

- Cloudflare Workers + D1 + R2 + Containers deploy target (spec §10.2c).
  Pages ships today; the serverless server-node path is deferred to
  post-launch.
- Server-node export/import (spec §14.7). If a user outgrows their
  Mini PC they can't migrate yet.
- `[limits]` values are plumbed through config but not enforced at a
  single chokepoint. Counting devices and rejecting registrations past
  `max_devices_per_user` is the next easy slice.
- "Open on another device" action in the offline-host toast. The toast
  text exists; wiring the action to the fork dialog is the TODO.
- Google token refresh works on `driveAppData`'s opportunistic path,
  but the sign-in layer does not proactively refresh the ID token
  before expiry — long-lived tabs get kicked back to the sign-in
  dialog instead of refreshing silently.

## Smaller things

- [ ] Submitting new messages should scroll to bottom (upstream T3
      issue; still open in V3).
- [ ] Only show last 10 threads for a given project in the legacy
      sidebar fallback.
- [ ] New projects should sort to the top of the project picker.
- [ ] Projects should be sorted by latest thread update.
- [ ] Message queueing across host disconnects (spec calls this out as
      _not_ in v1, but users will ask).
