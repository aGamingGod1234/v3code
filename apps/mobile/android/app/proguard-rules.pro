# V3 Phase 9 — Android proguard rules.
# Capacitor + Firebase ship with default consumer rules; we only need
# to keep our own Java sources discoverable for the WebView bridge.
-keep class com.agaminggod.v3code.** { *; }
-keepattributes Signature, Exceptions, EnclosingMethod, InnerClasses, Annotation
-dontwarn org.apache.cordova.**
