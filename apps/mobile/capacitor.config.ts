// V3 Phase 9 — Capacitor 6 project config for the Android wrap of the
// cloud-mode web bundle.
//
// Points at `webview-bundle/` so `bun run build` is the single entry
// point that (a) consumes `apps/web/dist-cloud/` produced by
// `bun run build:web-cloud` and (b) stages it under
// `apps/mobile/webview-bundle/` alongside an `android.webview-config.json`
// that tells the Capacitor native shell where to find the WS / HTTP
// origin at runtime.
//
// The `server.url` branch only activates when `VITE_V3_MOBILE_REMOTE_URL`
// was set at build time — otherwise the APK boots its bundled assets
// (the normal Play-Store distribution path). Remote URL is the dev
// loopback helper: it lets `bun run dev:web` + `bunx cap run android`
// work side-by-side without rebuilding the bundle on every edit.

import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const remoteUrl = process.env.VITE_V3_MOBILE_REMOTE_URL?.trim();
const androidScheme = process.env.V3_MOBILE_ANDROID_SCHEME?.trim() || "https";

const config: CapacitorConfig = {
  appId: "com.agaminggod.v3code",
  appName: "V3 Code",
  webDir: "webview-bundle",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
  },
  server:
    remoteUrl !== undefined && remoteUrl.length > 0
      ? {
          androidScheme,
          url: remoteUrl,
          cleartext: remoteUrl.startsWith("http://"),
        }
      : {
          androidScheme,
        },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0b0b0f",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b0b0f",
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
