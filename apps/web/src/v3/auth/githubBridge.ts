// Renderer-side typed wrapper around `desktopBridge.github.*`.
// Returns plain promises with the safe-status shapes the main process exposes.
// The renderer must never see a raw access token — the bridge surface enforces this.

import type {
  GitHubAuthStatus,
  GitHubDeviceFlowClientConfig,
  GitHubDeviceFlowStart,
  GitHubDeviceFlowStatus,
  GitHubTokenValidation,
} from "@v3tools/contracts";

const requireBridge = () => {
  const bridge = window.desktopBridge?.github;
  if (!bridge) {
    throw new Error(
      "github-bridge-unavailable: desktop GitHub bridge is only present in the V3 desktop app.",
    );
  }
  return bridge;
};

export const isGitHubBridgeAvailable = (): boolean =>
  typeof window !== "undefined" && Boolean(window.desktopBridge?.github);

export const setClientIdOverride = async (clientId: string | null): Promise<void> => {
  await requireBridge().setClientIdOverride({ clientId });
};

export const getGitHubClientConfig = async (
  clientIdOverride?: string | null,
): Promise<GitHubDeviceFlowClientConfig> =>
  requireBridge().getClientConfig({ clientIdOverride: clientIdOverride ?? null });

export const startDeviceFlow = async (input: {
  readonly scopes: ReadonlyArray<string>;
  readonly clientIdOverride?: string | null;
}): Promise<GitHubDeviceFlowStart> => requireBridge().startDeviceFlow(input);

export const getDeviceFlowStatus = async (
  deviceCodeHandle: string,
): Promise<GitHubDeviceFlowStatus> => requireBridge().getDeviceFlowStatus({ deviceCodeHandle });

export const cancelDeviceFlow = async (deviceCodeHandle: string): Promise<void> => {
  await requireBridge().cancelDeviceFlow({ deviceCodeHandle });
};

export const getGitHubStatus = async (): Promise<GitHubAuthStatus> => requireBridge().getStatus();

export const disconnectGitHub = async (): Promise<{ readonly localCleared: boolean }> =>
  requireBridge().disconnect();

export const validateGitHubToken = async (): Promise<GitHubTokenValidation> =>
  requireBridge().validateToken();

export const getManualRevokeUrl = async (): Promise<string> => requireBridge().manualRevokeUrl();
