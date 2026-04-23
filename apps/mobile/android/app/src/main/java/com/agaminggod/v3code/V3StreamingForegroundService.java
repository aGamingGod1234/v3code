package com.agaminggod.v3code;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * V3 Phase 9 — foreground service that keeps the WebSocket alive
 * during live agent streaming while the app is backgrounded / paused.
 *
 * The web bundle starts / stops this service via a bridge call
 * whenever {@link com.agaminggod.v3code.V3StreamingForegroundService#ACTION_START}
 * or {@link com.agaminggod.v3code.V3StreamingForegroundService#ACTION_STOP} is
 * received. See `apps/mobile/src/backgroundStrategy.ts` for the policy
 * that decides when those actions fire.
 *
 * We don't need heartbeats or WS logic here — Capacitor keeps a live
 * WebView process up while the service is running, which is enough for
 * the JS-side WebSocket inside the bundle to stay connected.
 */
public class V3StreamingForegroundService extends Service {

    public static final String ACTION_START = "com.agaminggod.v3code.action.START_STREAMING";
    public static final String ACTION_STOP = "com.agaminggod.v3code.action.STOP_STREAMING";
    public static final String CHANNEL_ID = "v3_streaming_channel";
    private static final int NOTIFICATION_ID = 4201;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_STICKY;
        }
        if (ACTION_STOP.equals(intent.getAction())) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        ensureChannel();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Live agent streaming",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps V3 Code's connection alive while a chat is mid-turn.");
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Context context = getApplicationContext();
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, launchIntent, flags);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle("V3 Code is streaming")
                .setContentText("Tap to return to your live chat.")
                .setSmallIcon(R.drawable.ic_notification)
                .setOngoing(true)
                .setContentIntent(contentIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }
}
