import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@v3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
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
const V3_CHAT_IMPORT_LIST_TRANSCRIPTS_CHANNEL = "desktop:v3-chat-import-list-transcripts";
const V3_CHAT_IMPORT_READ_TRANSCRIPT_CHANNEL = "desktop:v3-chat-import-read-transcript";

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
  chatImport: {
    listLocalTranscripts: () => ipcRenderer.invoke(V3_CHAT_IMPORT_LIST_TRANSCRIPTS_CHANNEL),
    readTranscript: (path) => ipcRenderer.invoke(V3_CHAT_IMPORT_READ_TRANSCRIPT_CHANNEL, path),
  },
} satisfies DesktopBridge);
