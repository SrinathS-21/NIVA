package com.nivaapp.niva

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

/**
 * The hand-off between the two Android components that see raw messages and
 * the JavaScript pipeline that understands them.
 *
 * Both producers — the notification listener service and the SMS receiver —
 * are started by the system, not by the app. They routinely run when there is
 * no React context alive at all: the process is resurrected for a single
 * broadcast and torn down again seconds later. A component that only emitted
 * a JS event would therefore drop most of what it saw, silently, and only on
 * exactly the devices where the app matters most (aggressive OEM task
 * killers).
 *
 * So every signal is written to disk first and emitted second. Persisting is
 * the contract; the event is an optimisation that lets a foregrounded app
 * react immediately instead of on its next drain. If the emit fails — no
 * context, bridgeless host not ready, instance being reloaded — nothing is
 * lost, because JS drains this queue on every foreground.
 *
 * SharedPreferences rather than SQLite deliberately: the JS side owns
 * `niva.db`, and having a native component write to the same file behind
 * expo-sqlite's back is how you corrupt a WAL. This is a mailbox, not a
 * store — items live in it for seconds, and JS deletes what it has consumed.
 */
object NivaSignalQueue {
    private const val PREFS = "niva_signal_queue"
    private const val KEY = "pending"

    /**
     * How many unconsumed signals to keep. A phone left alone for a week with
     * the app force-stopped can accumulate thousands of notifications; the
     * oldest ones have no value by the time anyone looks, and an unbounded
     * JSON blob in SharedPreferences is a real ANR on the next write.
     */
    private const val MAX_PENDING = 300

    const val EVENT_NAME = "NivaSignal"

    private val lock = Any()

    /**
     * The live React context, published by `NivaModule` when it is constructed.
     *
     * Reaching it this way rather than through `ReactApplication.reactHost`
     * deliberately: the host interface has been reshaped more than once across
     * React Native versions (bridge, bridgeless, and the transition between
     * them), and a capture component that fails to *compile* against a future
     * RN upgrade is a much worse outcome than one that occasionally has no
     * context to emit into. A module instance is the same object in every
     * architecture.
     *
     * Volatile because it is written on the JS thread and read on whichever
     * thread the system happened to deliver a notification on.
     */
    @Volatile
    private var reactContext: ReactApplicationContext? = null

    fun attachReactContext(context: ReactApplicationContext) {
        reactContext = context
    }

    /** Records one raw signal and, if JS happens to be alive, wakes it. */
    fun enqueue(context: Context, signal: JSONObject) {
        synchronized(lock) {
            val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val existing = readArray(prefs.getString(KEY, null))
            existing.put(signal)

            // Trim from the front — oldest first.
            val trimmed = if (existing.length() > MAX_PENDING) {
                val out = JSONArray()
                for (i in (existing.length() - MAX_PENDING) until existing.length()) {
                    out.put(existing.get(i))
                }
                out
            } else {
                existing
            }

            prefs.edit().putString(KEY, trimmed.toString()).apply()
        }

        emit(context, signal)
    }

    /**
     * Everything recorded since the last drain, as a JS array. Reading does
     * not clear — `clear()` is a separate call so a JS-side crash between the
     * two loses nothing. Re-delivery is safe: the pipeline dedupes.
     */
    fun peekAll(context: Context): WritableArray {
        val json = synchronized(lock) {
            context.applicationContext
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY, null)
        }
        val array = readArray(json)
        val out = Arguments.createArray()
        for (i in 0 until array.length()) {
            array.optJSONObject(i)?.let { out.pushMap(toWritableMap(it)) }
        }
        return out
    }

    /** Drops the first `count` entries — the ones JS has confirmed it stored. */
    fun clearConsumed(context: Context, count: Int) {
        synchronized(lock) {
            val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val existing = readArray(prefs.getString(KEY, null))
            if (count >= existing.length()) {
                prefs.edit().remove(KEY).apply()
                return
            }
            val out = JSONArray()
            for (i in count until existing.length()) out.put(existing.get(i))
            prefs.edit().putString(KEY, out.toString()).apply()
        }
    }

    fun pendingCount(context: Context): Int {
        val json = synchronized(lock) {
            context.applicationContext
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY, null)
        }
        return readArray(json).length()
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private fun readArray(raw: String?): JSONArray =
        if (raw.isNullOrEmpty()) JSONArray() else try {
            JSONArray(raw)
        } catch (e: Exception) {
            // A corrupt blob is not worth crashing a broadcast receiver over.
            Log.w("NivaSignalQueue", "Discarding unreadable queue", e)
            JSONArray()
        }

    private fun toWritableMap(obj: JSONObject): WritableMap {
        val map = Arguments.createMap()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val value = obj.get(key)) {
                is Int -> map.putInt(key, value)
                is Long -> map.putDouble(key, value.toDouble())
                is Double -> map.putDouble(key, value)
                is Boolean -> map.putBoolean(key, value)
                JSONObject.NULL -> map.putNull(key)
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    /**
     * Best-effort wake-up. Every failure mode here is expected rather than
     * exceptional — the app is usually not running when this fires — so it is
     * logged at debug and swallowed.
     */
    private fun emit(context: Context, signal: JSONObject) {
        try {
            val live = reactContext ?: return
            if (!live.hasActiveReactInstance()) return
            live
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_NAME, toWritableMap(signal))
        } catch (e: Throwable) {
            Log.d("NivaSignalQueue", "No live JS context to notify: ${e.message}")
        }
    }
}
