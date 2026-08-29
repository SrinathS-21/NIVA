package com.nivaapp.niva

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject

/**
 * Reads the notification shade.
 *
 * This is the app's primary input. Everything downstream — normalizer, Needle,
 * the inbox — exists to make sense of what arrives here, so what this class
 * chooses *not* to forward matters as much as what it does. Two filters run
 * before anything reaches the queue:
 *
 *  1. Structural noise the user never sees as a message anyway: our own
 *     notifications, ongoing/foreground-service chrome ("Screen recording",
 *     "Charging"), group summaries (whose text is a count of the children we
 *     already forwarded), and media transport controls.
 *  2. Empty posts. A notification whose only payload is an icon and a title
 *     like "2 new messages" carries nothing to extract.
 *
 * Content-level noise — promos, OTPs, social — is deliberately *not* filtered
 * here. That judgement lives in `SignalNormalizer` on the JS side, where it is
 * testable and changeable without a native rebuild. This class stays dumb.
 */
class NivaNotificationListenerService : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Notification listener connected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            if (!shouldForward(sbn)) return

            val extras = sbn.notification.extras
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()

            // `bigText` is the expanded form and is usually the complete
            // message; `text` is the collapsed one-liner and is frequently
            // ellipsised mid-sentence. Bank SMS-forwarding apps in particular
            // put the amount past the truncation point, so preferring the long
            // form here is the difference between extracting ₹8,420 and
            // extracting nothing.
            val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
            val body = bigText?.takeIf { it.isNotEmpty() } ?: text

            if (body.isNullOrEmpty() && title.isNullOrEmpty()) return

            val signal = JSONObject().apply {
                put("id", "notif-${sbn.key}-${sbn.postTime}")
                put("source", "notification")
                put("packageName", sbn.packageName)
                put("sender", title ?: JSONObject.NULL)
                put("title", title ?: JSONObject.NULL)
                put("text", body ?: "")
                put("receivedAt", sbn.postTime)
            }

            NivaSignalQueue.enqueue(applicationContext, signal)
        } catch (e: Throwable) {
            // A listener service that throws is disabled by the system until
            // the user re-grants access. Nothing in here is worth that.
            Log.e(TAG, "Failed to handle notification", e)
        }
    }

    private fun shouldForward(sbn: StatusBarNotification): Boolean {
        if (sbn.packageName == applicationContext.packageName) return false

        val notification = sbn.notification
        val flags = notification.flags

        if (flags and Notification.FLAG_ONGOING_EVENT != 0) return false
        if (flags and Notification.FLAG_GROUP_SUMMARY != 0) return false
        if (flags and Notification.FLAG_FOREGROUND_SERVICE != 0) return false

        // Media sessions post a notification on every track change.
        if (Notification.CATEGORY_TRANSPORT == notification.category) return false
        if (Notification.CATEGORY_SERVICE == notification.category) return false
        if (Notification.CATEGORY_PROGRESS == notification.category) return false

        return true
    }

    private companion object {
        const val TAG = "NivaNotifications"
    }
}
