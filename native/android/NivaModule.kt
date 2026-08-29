package com.nivaapp.niva

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * The JS-facing surface of everything Android-only in Niva.
 *
 * Two jobs: report and change the state of the two capture permissions, and
 * hand over whatever `NivaSignalQueue` has collected since the last drain.
 *
 * Runtime SMS permission is deliberately absent — React Native's own
 * `PermissionsAndroid` already does that correctly, including the
 * "don't ask again" case, and a second implementation here would be one more
 * thing to keep in step with the platform.
 */
class NivaModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        // Hand the queue a way to wake JS. See the note on
        // `NivaSignalQueue.attachReactContext`.
        NivaSignalQueue.attachReactContext(reactContext)
    }

    override fun getName() = "NivaModule"

    // ── Notification access ──────────────────────────────────────────────────

    @ReactMethod
    fun isNotificationListenerGranted(promise: Promise) {
        try {
            val enabled = NotificationManagerCompat.getEnabledListenerPackages(reactApplicationContext)
            promise.resolve(enabled.contains(reactApplicationContext.packageName))
        } catch (e: Throwable) {
            promise.reject("E_LISTENER_CHECK", e)
        }
    }

    @ReactMethod
    fun openNotificationListenerSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
    }

    /**
     * Asks the system to re-bind the listener service.
     *
     * Android unbinds a notification listener that it thinks has misbehaved
     * (a crash, an app update, a long doze) and does not always rebind on its
     * own. From the user's side that presents as the app quietly capturing
     * nothing while the permission still shows as granted, which is the worst
     * possible failure: silent and invisible. Calling this on foreground costs
     * nothing when the service is already healthy.
     */
    @ReactMethod
    fun requestListenerRebind(promise: Promise) {
        try {
            NotificationListenerService.requestRebind(
                ComponentName(reactApplicationContext, NivaNotificationListenerService::class.java)
            )
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.resolve(false)
        }
    }

    // ── Captured signal queue ────────────────────────────────────────────────

    @ReactMethod
    fun getPendingSignals(promise: Promise) {
        try {
            val signals: WritableArray = NivaSignalQueue.peekAll(reactApplicationContext)
            promise.resolve(signals)
        } catch (e: Throwable) {
            promise.reject("E_QUEUE_READ", e)
        }
    }

    /**
     * Acknowledges the first `count` signals. Called only once JS has them
     * committed to SQLite, so a crash mid-drain re-delivers rather than loses.
     */
    @ReactMethod
    fun clearConsumedSignals(count: Double, promise: Promise) {
        try {
            NivaSignalQueue.clearConsumed(reactApplicationContext, count.toInt())
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("E_QUEUE_CLEAR", e)
        }
    }

    @ReactMethod
    fun getPendingCount(promise: Promise) {
        try {
            promise.resolve(NivaSignalQueue.pendingCount(reactApplicationContext))
        } catch (e: Throwable) {
            promise.resolve(0)
        }
    }

    // ── NativeEventEmitter plumbing ──────────────────────────────────────────
    // Required stubs. Without them `new NativeEventEmitter(NivaModule)` warns
    // on every subscription on Android and throws outright under the new
    // architecture.

    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit
}
