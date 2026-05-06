import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@v3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CREATE_DIRECTORY_CHANNEL = "desktop:create-directory";
const CONFIRM_CHANNEL = "desktop:confirm";
const SET_THEME_CHANNEL = "desktop:set-theme";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_SET_CHANNEL_CHANNEL = "desktop:update-set-channel";
const UPDATE_CHECK_CHANNEL = "desktop:update-check";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
const GET_APP_BRANDING_CHANNEL = "desktop:get-app-branding";
const GET_HOSTNAME_CHANNEL = "desktop:get-hostname";
const GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL = "desktop:get-local-environment-bootstrap";
const GET_CLIENT_SETTINGS_CHANNEL = "desktop:get-client-settings";
const SET_CLIENT_SETTINGS_CHANNEL = "desktop:set-client-settings";
const GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL = "desktop:get-saved-environment-registry";
const SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL = "desktop:set-saved-environment-registry";
const GET_SAVED_ENVIRONMENT_SECRET_CHANNEL = "desktop:get-saved-environment-secret";
const SET_SAVED_ENVIRONMENT_SECRET_CHANNEL = "desktop:set-saved-environment-secret";
const REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL = "desktop:remove-saved-environment-secret";
const GET_V3_GOOGLE_TOKENS_CHANNEL = "desktop:get-v3-google-tokens";
const SET_V3_GOOGLE_TOKENS_CHANNEL = "desktop:set-v3-google-tokens";
const CLEAR_V3_GOOGLE_TOKENS_CHANNEL = "desktop:clear-v3-google-tokens";
const GET_SERVER_EXPOSURE_STATE_CHANNEL = "desktop:get-server-exposure-state";
const SET_SERVER_EXPOSURE_MODE_CHANNEL = "desktop:set-server-exposure-mode";
// V3 Phase 1d — main-process Google sign-in.
const V3_OPEN_GOOGLE_SIGNIN_CHANNEL = "desktop:v3-open-google-signin";
// V3 — main-process GitHub sign-in (loopback OAuth in external browser).
const V3_OPEN_GITHUB_SIGNIN_CHANNEL = "desktop:v3-open-github-signin";
// V3 Phase 2d — setup wizard channels. Matches V3_WIZARD_CHANNELS in
// apps/desktop/src/v3SetupWizard.ts; kept flat here because preload has
// no access to shared runtime modules.
const V3_WIZARD_PROBE_DOCKER_CHANNEL = "desktop:v3-wizard-probe-docker";
const V3_WIZARD_PROBE_PORT_CHANNEL = "desktop:v3-wizard-probe-port";
const V3_WIZARD_PROBE_CLOUDFLARED_CHANNEL = "desktop:v3-wizard-probe-cloudflared";
const V3_WIZARD_PROBE_PATHS_CHANNEL = "desktop:v3-wizard-probe-paths";
const V3_WIZARD_PICK_DATA_DIRECTORY_CHANNEL = "desktop:v3-wizard-pick-data-directory";
const V3_WIZARD_WRITE_CONFIG_CHANNEL = "desktop:v3-wizard-write-config";
const V3_WIZARD_GENERATE_KEY_CHANNEL = "desktop:v3-wizard-generate-key";
const V3_SPAWN_DISCOVERY_GET_OPTIONS_CHANNEL = "desktop:v3-spawn-discovery-get-options";
const V3_GITHUB_SET_CLIENT_ID_OVERRIDE_CHANNEL = "desktop:v3-github-set-client-id-override";
const V3_GITHUB_GET_CLIENT_CONFIG_CHANNEL = "desktop:v3-github-get-client-config";
const V3_GITHUB_START_DEVICE_FLOW_CHANNEL = "desktop:v3-github-start-device-flow";
const V3_GITHUB_GET_DEVICE_FLOW_STATUS_CHANNEL = "desktop:v3-github-get-device-flow-status";
const V3_GITHUB_CANCEL_DEVICE_FLOW_CHANNEL = "desktop:v3-github-cancel-device-flow";
const V3_GITHUB_GET_STATUS_CHANNEL = "desktop:v3-github-get-status";
const V3_GITHUB_DISCONNECT_CHANNEL = "desktop:v3-github-disconnect";
const V3_GITHUB_VALIDATE_TOKEN_CHANNEL = "desktop:v3-github-validate-token";
const V3_GITHUB_MANUAL_REVOKE_URL_CHANNEL = "desktop:v3-github-manual-revoke-url";
const V3_CHAT_IMPORT_OPEN_SESSION_CHANNEL = "desktop:v3-chat-import-open-session";
const V3_CHAT_IMPORT_LIST_LOCAL_CHANNEL = "desktop:v3-chat-import-list-local";
const V3_CHAT_IMPORT_SCAN_FOLDER_CHANNEL = "desktop:v3-chat-import-scan-folder";
const V3_CHAT_IMPORT_READ_PREVIEW_CHANNEL = "desktop:v3-chat-import-read-preview";
const V3_CHAT_IMPORT_READ_TRANSCRIPT_CHANNEL = "desktop:v3-chat-import-read-transcript";
const V3_CHAT_IMPORT_CLOSE_SESSION_CHANNEL = "desktop:v3-chat-import-close-session";

contextBridge.exposeInMainWorld("desktopBridge", {
  getAppBranding: () => {
    const result = ipcRenderer.sendSync(GET_APP_BRANDING_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getAppBranding"]>;
  },
  getHostname: () => {
    const result = ipcRenderer.sendSync(GET_HOSTNAME_CHANNEL);
    if (typeof result !== "string" || result.length === 0) {
      return null;
    }
    return result;
  },
  getLocalEnvironmentBootstrap: () => {
    const result = ipcRenderer.sendSync(GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getLocalEnvironmentBootstrap"]>;
  },
  getClientSettings: () => ipcRenderer.invoke(GET_CLIENT_SETTINGS_CHANNEL),
  setClientSettings: (settings) => ipcRenderer.invoke(SET_CLIENT_SETTINGS_CHANNEL, settings),
  getSavedEnvironmentRegistry: () => ipcRenderer.invoke(GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL),
  setSavedEnvironmentRegistry: (records) =>
    ipcRenderer.invoke(SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL, records),
  getSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(GET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  setSavedEnvironmentSecret: (environmentId, secret) =>
    ipcRenderer.invoke(SET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId, secret),
  removeSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  getV3GoogleTokens: () => ipcRenderer.invoke(GET_V3_GOOGLE_TOKENS_CHANNEL),
  setV3GoogleTokens: (tokens) => ipcRenderer.invoke(SET_V3_GOOGLE_TOKENS_CHANNEL, tokens),
  clearV3GoogleTokens: () => ipcRenderer.invoke(CLEAR_V3_GOOGLE_TOKENS_CHANNEL),
  getServerExposureState: () => ipcRenderer.invoke(GET_SERVER_EXPOSURE_STATE_CHANNEL),
  setServerExposureMode: (mode) => ipcRenderer.invoke(SET_SERVER_EXPOSURE_MODE_CHANNEL, mode),
  pickFolder: (options) => ipcRenderer.invoke(PICK_FOLDER_CHANNEL, options),
  createDirectory: (input) => ipcRenderer.invoke(CREATE_DIRECTORY_CHANNEL, input),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  setUpdateChannel: (channel) => ipcRenderer.invoke(UPDATE_SET_CHANNEL_CHANNEL, channel),
  checkForUpdate: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
  openV3GoogleSignIn: (input) => ipcRenderer.invoke(V3_OPEN_GOOGLE_SIGNIN_CHANNEL, input),
  openV3GitHubSignIn: (input) => ipcRenderer.invoke(V3_OPEN_GITHUB_SIGNIN_CHANNEL, input),
  v3Wizard: {
    probeDocker: () => ipcRenderer.invoke(V3_WIZARD_PROBE_DOCKER_CHANNEL),
    probePort: (port) => ipcRenderer.invoke(V3_WIZARD_PROBE_PORT_CHANNEL, port),
    probeCloudflared: () => ipcRenderer.invoke(V3_WIZARD_PROBE_CLOUDFLARED_CHANNEL),
    probePaths: () => ipcRenderer.invoke(V3_WIZARD_PROBE_PATHS_CHANNEL),
    pickDataDirectory: (options) =>
      ipcRenderer.invoke(V3_WIZARD_PICK_DATA_DIRECTORY_CHANNEL, options),
    writeServerNodeConfig: (input) => ipcRenderer.invoke(V3_WIZARD_WRITE_CONFIG_CHANNEL, input),
    generateEncryptionKey: () => ipcRenderer.invoke(V3_WIZARD_GENERATE_KEY_CHANNEL),
  },
  spawnDiscovery: {
    getOptions: (input) => ipcRenderer.invoke(V3_SPAWN_DISCOVERY_GET_OPTIONS_CHANNEL, input ?? {}),
  },
  github: {
    setClientIdOverride: (input) =>
      ipcRenderer.invoke(V3_GITHUB_SET_CLIENT_ID_OVERRIDE_CHANNEL, input),
    getClientConfig: (input) => ipcRenderer.invoke(V3_GITHUB_GET_CLIENT_CONFIG_CHANNEL, input),
    startDeviceFlow: (input) => ipcRenderer.invoke(V3_GITHUB_START_DEVICE_FLOW_CHANNEL, input),
    getDeviceFlowStatus: (input) =>
      ipcRenderer.invoke(V3_GITHUB_GET_DEVICE_FLOW_STATUS_CHANNEL, input),
    cancelDeviceFlow: (input) => ipcRenderer.invoke(V3_GITHUB_CANCEL_DEVICE_FLOW_CHANNEL, input),
    getStatus: () => ipcRenderer.invoke(V3_GITHUB_GET_STATUS_CHANNEL),
    disconnect: () => ipcRenderer.invoke(V3_GITHUB_DISCONNECT_CHANNEL),
    validateToken: () => ipcRenderer.invoke(V3_GITHUB_VALIDATE_TOKEN_CHANNEL),
    manualRevokeUrl: () => ipcRenderer.invoke(V3_GITHUB_MANUAL_REVOKE_URL_CHANNEL),
  },
  chatImport: {
    openSession: () => ipcRenderer.invoke(V3_CHAT_IMPORT_OPEN_SESSION_CHANNEL),
    listLocal: (input) => ipcRenderer.invoke(V3_CHAT_IMPORT_LIST_LOCAL_CHANNEL, input),
    scanFolder: (input) => ipcRenderer.invoke(V3_CHAT_IMPORT_SCAN_FOLDER_CHANNEL, input),
    readPreview: (input) => ipcRenderer.invoke(V3_CHAT_IMPORT_READ_PREVIEW_CHANNEL, input),
    readTranscript: (input) => ipcRenderer.invoke(V3_CHAT_IMPORT_READ_TRANSCRIPT_CHANNEL, input),
    closeSession: (input) => ipcRenderer.invoke(V3_CHAT_IMPORT_CLOSE_SESSION_CHANNEL, input),
  },
} satisfies DesktopBridge);
