package com.agaminggod.v3code;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * V3 Phase 9 — FCM receiver service.
 *
 * The Capacitor Firebase Messaging plugin already subscribes to
 * `com.google.firebase.MESSAGING_EVENT` and forwards payloads to the
 * JS bridge. This thin subclass exists so that:
 *
 *   1. The manifest declares a single Firebase service entry (required
 *      by `com.google.gms.google-services`).
 *   2. We can hook `onNewToken` in native code for diagnostics and
 *      early wake scheduling — the JS bridge sometimes takes a few
 *      extra seconds to attach after cold start, so stashing the new
 *      token in `SharedPreferences` here guarantees the web bundle
 *      sees it on next boot via the Preferences plugin.
 */
public class V3MessagingService extends FirebaseMessagingService {

    private static final String PREFS = "v3_push";
    private static final String KEY_PENDING_TOKEN = "pending_fcm_token";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(KEY_PENDING_TOKEN, token)
                .apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Default delivery — Capacitor plugin handles it via its own receiver.
        // This override is required by FirebaseMessagingService but intentionally
        // does no custom logic so we don't double-deliver notifications.
        super.onMessageReceived(remoteMessage);
    }
}
