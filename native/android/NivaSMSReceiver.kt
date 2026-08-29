package com.nivaapp.niva

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import org.json.JSONObject

/**
 * Reads incoming SMS.
 *
 * The second input, and on Indian networks the more valuable one: banks,
 * billers and couriers all still send transactional SMS, and unlike a push
 * notification an SMS is never collapsed or truncated by the sender.
 *
 * The one subtlety is multipart. A message longer than 160 GSM-7 characters
 * arrives as several PDUs in a single broadcast, and a bank statement line is
 * very often exactly that. Handling each PDU as its own signal would split the
 * amount from the merchant and produce two useless fragments, so the parts are
 * concatenated per originating address, in arrival order, before anything is
 * enqueued.
 */
class NivaSMSReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
            if (messages.isEmpty()) return

            // LinkedHashMap: preserve the order the parts arrived in. A
            // reordered reassembly reads as garbled text to the model.
            val bySender = LinkedHashMap<String, StringBuilder>()
            var timestamp = System.currentTimeMillis()

            for (message in messages) {
                val sender = message.displayOriginatingAddress ?: UNKNOWN_SENDER
                val body = message.displayMessageBody ?: continue
                bySender.getOrPut(sender) { StringBuilder() }.append(body)
                timestamp = message.timestampMillis
            }

            for ((sender, body) in bySender) {
                val text = body.toString().trim()
                if (text.isEmpty()) continue

                val signal = JSONObject().apply {
                    put("id", "sms-$sender-$timestamp-${text.length}")
                    put("source", "sms")
                    put("packageName", JSONObject.NULL)
                    put("sender", sender)
                    put("title", sender)
                    put("text", text)
                    put("receivedAt", timestamp)
                }

                NivaSignalQueue.enqueue(context, signal)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to handle SMS broadcast", e)
        }
    }

    private companion object {
        const val TAG = "NivaSMS"
        const val UNKNOWN_SENDER = "Unknown"
    }
}
