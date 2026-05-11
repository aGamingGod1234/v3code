import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { V3ConnectGitHubButton } from "../../v3/ui/ConnectGitHubButton";
import { isGitHubBridgeAvailable, setClientIdOverride } from "../../v3/auth/githubBridge";

export function GitSettings() {
  const settings = useSettings((s) => ({
    gitHub: s.gitHub,
  }));
  const { updateSettings } = useUpdateSettings();
  const desktopFlowAvailable = isGitHubBridgeAvailable();
  const [clientIdInput, setClientIdInput] = useState(settings.gitHub.deviceFlowClientId);
  const [useBuiltIn, setUseBuiltIn] = useState(
    () => settings.gitHub.deviceFlowClientId.length === 0,
  );

  useEffect(() => {
    if (!desktopFlowAvailable) return;
    const resolved = useBuiltIn ? null : clientIdInput.trim() || null;
    void setClientIdOverride(resolved).catch(() => {});
  }, [desktopFlowAvailable, useBuiltIn, clientIdInput]);

  const onSave = () => {
    const trimmed = clientIdInput.trim();
    updateSettings({
      gitHub: {
        ...settings.gitHub,
        deviceFlowClientId: useBuiltIn ? "" : trimmed,
      },
    });
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">GitHub sign-in</h3>
          <p className="text-xs text-muted-foreground">
            Connects a GitHub account so V3 can browse your repositories and validate the stored
            token before any cloud handoff.
          </p>
        </header>
        <V3ConnectGitHubButton />
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">GitHub OAuth Client ID</h3>
          <p className="text-xs text-muted-foreground">
            Desktop GitHub sign-in uses GitHub Device Flow, which only needs a public OAuth Client
            ID. Browser/server-node sign-in can still use the server-hosted redirect flow when the
            node has a GitHub client secret configured.
          </p>
        </header>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-card/30 p-3 text-sm">
          <input
            type="checkbox"
            checked={useBuiltIn}
            onChange={(event) => setUseBuiltIn(event.currentTarget.checked)}
            className="mt-1"
          />
          <div>
            <div className="font-medium text-foreground">
              Use the built-in client ID when available
            </div>
            <div className="text-xs text-muted-foreground">
              Falls back to V3CODE_GITHUB_PUBLIC_CLIENT_ID baked at build time.
            </div>
          </div>
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={clientIdInput}
            placeholder="Iv1.abcdef0123456789"
            onChange={(event) => {
              setClientIdInput(event.currentTarget.value);
              setUseBuiltIn(false);
            }}
            className="h-9 min-w-[260px] flex-1 rounded-md border border-border bg-background px-2 text-xs"
          />
          <Button type="button" size="sm" onClick={onSave}>
            Save
          </Button>
        </div>
      </section>
    </div>
  );
}
