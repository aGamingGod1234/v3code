import { GlobeIcon, ShieldCheckIcon } from "lucide-react";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { isElectron } from "../../env";

const SUPPORT_LABEL = isElectron
  ? "Desktop browser automation available"
  : "Browser automation available through the server environment when configured";

export function BrowserUseSettings() {
  const browserUse = useSettings((settings) => settings.browserUse);
  const { updateSettings } = useUpdateSettings();
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Browser use</h3>
          <p className="text-xs text-muted-foreground">
            Controls whether agent runs can open an isolated browser for DOM verification, UI
            testing, and login-gated inspection.
          </p>
        </header>
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={browserUse.enabled}
              onChange={(event) =>
                updateSettings({
                  browserUse: { ...browserUse, enabled: event.currentTarget.checked },
                })
              }
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">Allow browser tool use</span>
              <span className="block text-xs text-muted-foreground">
                Each run still follows the approval and domain rules below.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Mode</span>
          <select
            value={browserUse.mode}
            onChange={(event) =>
              updateSettings({
                browserUse: {
                  ...browserUse,
                  mode: event.currentTarget.value as typeof browserUse.mode,
                },
              })
            }
            className="h-8 w-full rounded-md border border-border bg-background px-2"
          >
            <option value="headed">Headed</option>
            <option value="headless">Headless</option>
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Cookie policy</span>
          <select
            value={browserUse.cookiePolicy}
            onChange={(event) =>
              updateSettings({
                browserUse: {
                  ...browserUse,
                  cookiePolicy: event.currentTarget.value as typeof browserUse.cookiePolicy,
                },
              })
            }
            className="h-8 w-full rounded-md border border-border bg-background px-2"
          >
            <option value="isolated">Isolated profile</option>
            <option value="reuse-current">Reuse current profile</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-foreground">
          <input
            type="checkbox"
            checked={browserUse.isolatedProfile}
            onChange={(event) =>
              updateSettings({
                browserUse: { ...browserUse, isolatedProfile: event.currentTarget.checked },
              })
            }
          />
          Use a separate browser profile by default
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-foreground">
          <input
            type="checkbox"
            checked={browserUse.requirePerRunApproval}
            onChange={(event) =>
              updateSettings({
                browserUse: {
                  ...browserUse,
                  requirePerRunApproval: event.currentTarget.checked,
                },
              })
            }
          />
          Ask before each browser-control run
        </label>
        <label className="space-y-1 text-xs sm:col-span-2">
          <span className="font-medium text-foreground">Domain allowlist</span>
          <textarea
            value={browserUse.domainAllowlist}
            rows={4}
            onChange={(event) =>
              updateSettings({
                browserUse: { ...browserUse, domainAllowlist: event.currentTarget.value },
              })
            }
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
            placeholder={"localhost\n127.0.0.1\nv3.agaminggod.com"}
          />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GlobeIcon className="size-4 text-primary" />
            Runtime status
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{SUPPORT_LABEL}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheckIcon className="size-4 text-primary" />
            Dictation/browser APIs
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Web Speech API: {speechSupported ? "available" : "not available in this browser"}
          </p>
        </div>
      </section>
    </div>
  );
}
