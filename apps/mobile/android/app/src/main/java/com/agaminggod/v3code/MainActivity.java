package com.agaminggod.v3code;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * V3 Phase 9 — Capacitor host activity.
 *
 * The WebView contents come entirely from the staged cloud-mode web
 * bundle at `apps/mobile/webview-bundle/`. No JS plugins are registered
 * here beyond the Capacitor auto-registration because the V3 bundle
 * leans on the shipped plugins (App, Preferences, Network, Keyboard,
 * StatusBar, SplashScreen, Firebase Messaging). Deep links arriving
 * via the `v3://` scheme are forwarded to
 * {@link com.getcapacitor.Bridge#getWebView()} through Capacitor's
 * default intent handling.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Deep link handling is delegated to Capacitor's `App.addListener('appUrlOpen', ...)`
        // which the web bundle subscribes to on boot to finish the Google OAuth flow.
    }
}
