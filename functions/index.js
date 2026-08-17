const nodemailer = require("nodemailer");
const { setGlobalOptions } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const webpush = require("web-push");

initializeApp();
setGlobalOptions({ maxInstances: 10 });
const db = getFirestore();

const VAPID_PUBLIC = "BPUZCKpCFVDRD8xxpwxURabMud5HsEhcLdpnRXh7yLMENcegDeTuGJbN9hMwue4mKJIoq_tQrTUZpYxJJK5n_So";
const VAPID_PRIVATE = "xr3Ga8Yj2WGonS1RfgbIUn8rN1Ox2CBP5V_QjWI5Gi8";

webpush.setVapidDetails("mailto:smith.5939@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

async function sendPushToUser(userId, title, body, type = "general") {
  // Deduplication check — skip if same notification sent in last 60 seconds
  const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
  const dupeSnap = await db.collection("notifications")
    .where("toUid", "==", userId)
    .where("type", "==", type)
    .where("title", "==", title)
    .where("body", "==", body)
    .where("createdAt", ">", cutoff)
    .get();
  if (!dupeSnap.empty) {
    console.log("Duplicate notification skipped:", title);
    return;
  }
  // Write to Firestore notifications collection
  await db.collection("notifications").add({
    toUid: userId,
    title,
    body,
    type,
    read: false,
    createdAt: new Date().toISOString(),
  });

  // Send push notification if subscription exists
  const subsSnap = await db.collection("pushSubscriptions").where("userId", "==", userId).get();
  if (subsSnap.empty) return;
  const payload = JSON.stringify({ title, body });
  for (const subDoc of subsSnap.docs) {
    const subscription = subDoc.data().subscription;
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (e) {
      console.error("Push error:", e);
      if (e.statusCode === 410) await subDoc.ref.delete();
    }
  }

  // ── Native push (iOS/Android) via FCM ──
  try {
    const userSnap = await db.collection("users").doc(userId).get();
    const tokens = userSnap.exists ? (userSnap.data().fcmTokens || []) : [];
    if (tokens.length) {
      const resp = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { type: String(type) },
      });
      // Clean up any tokens FCM reports as invalid
      const stale = [];
      resp.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error && r.error.code;
          if (code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token") {
            stale.push(tokens[i]);
          }
        }
      });
      if (stale.length) {
        const { FieldValue } = require("firebase-admin/firestore");
        await db.collection("users").doc(userId).update({
          fcmTokens: FieldValue.arrayRemove(...stale),
        });
      }
    }
  } catch (e) {
    console.error("FCM push error:", e);
  }
}

const REMINDER_HOURS = { morning: 8, midday: 12, evening: 20 };

exports.dailyPrayerReminder = onSchedule("every 1 hours", async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const usersSnap = await db.collection("users").get();
  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    // Get user settings
    const settingsSnap = await db.collection("userSettings").doc(userId).get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    if (settings.remindersOn === false) continue;
    const timezone = settings.timezone || "America/New_York";
    const reminderTimes = settings.reminderTimes || ["morning"];
    // Get current hour in user's timezone
    const localHour = parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now));
    const shouldRemind = reminderTimes.some(t => REMINDER_HOURS[t] === localHour);
    if (!shouldRemind) continue;
    // Check last activity
    const activitySnap = await db.collection("userActivity").doc(userId).get();
    const lastActive = activitySnap.exists ? new Date(activitySnap.data().lastActive) : null;
    if (!lastActive || lastActive < cutoff) {
      await sendPushToUser(userId, "🙏 Time to pray", "Your prayer list is waiting. Take a moment to lift them up.", "reminder");
    }
  }
});

exports.prayerDateReminder = onSchedule("every day 08:00", async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const prayersSnap = await db.collection("prayers").where("prayerDate", "==", tomorrowStr).where("status", "==", "active").get();
  for (const prayerDoc of prayersSnap.docs) {
    const prayer = prayerDoc.data();
    await sendPushToUser(prayer.userId, "📅 Prayer date tomorrow", `"${prayer.title}" — tomorrow is the day. Praying with you.`, "reminder");
  }
});

exports.friendRequestNotification = onDocumentCreated("friendRequests/{requestId}", async (event) => {
  const request = event.data.data();
  if (!request || request.status !== "pending") return;
  await sendPushToUser(request.toUid, "👥 New friend request", `${request.fromName || "Someone"} wants to pray with you on LIFT.`, "friend_request");
});

exports.prayedForNotification = onDocumentCreated("prayingRecords/{recordId}", async (event) => {
  const record = event.data.data();
  if (!record) return;
  const { prayerOwnerId, prayerTitle, prayerName } = record;
  await sendPushToUser(prayerOwnerId, "🙏 Someone is praying for you", `${prayerName || "A friend"} is praying for "${prayerTitle}"`, "prayed_for");
});

// ── 5. Answered prayer notification ──────────────────────────────────────────
exports.answeredPrayerNotification = onDocumentUpdated(
  "prayers/{prayerId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return;
    if (after.status !== "answered") return;
    const prayerId = event.params.prayerId;
    const prayer = after;
    // Find all prayingRecords for this prayer
    const prayingSnap = await db.collection("prayingRecords")
      .where("prayerId", "==", prayerId)
      .get();
    // Get prayer owner name
    const ownerSnap = await db.collection("users").doc(prayer.userId).get();
    const ownerName = ownerSnap.exists ? (ownerSnap.data().displayName || "Someone") : "Someone";
    // Notify everyone who prayed for it AND delete their prayingRecords
    for (const record of prayingSnap.docs) {
      const { prayingUserId } = record.data();
      if (prayingUserId === prayer.userId) continue;
      await sendPushToUser(
        prayingUserId,
        "🙌 Prayer answered!",
        `${ownerName}'s prayer was answered: "${prayer.title}"`,
        "answered"
      );
      await record.ref.delete();
    }
    // Remove prayer from friends' lists (prayers added via sourceKey)
    const friendPrayersSnap = await db.collection("prayers")
      .where("sourceKey", "==", `${prayer.userId}-${prayerId}`)
      .get();
    for (const friendPrayer of friendPrayersSnap.docs) {
      await friendPrayer.ref.delete();
    }
  }
);

// ── 6. Cleanup prayingRecords when prayer is deleted (no notification) ────────
exports.cleanupOnPrayerDeleted = onDocumentDeleted(
  "prayers/{prayerId}",
  async (event) => {
    const prayerId = event.params.prayerId;
    const prayingSnap = await db.collection("prayingRecords")
      .where("prayerId", "==", prayerId)
      .get();
    for (const record of prayingSnap.docs) {
      await record.ref.delete();
    }
    const prayer = event.data.data();
    if (prayer) {
      const friendPrayersSnap = await db.collection("prayers")
        .where("sourceKey", "==", `${prayer.userId}-${prayerId}`)
        .get();
      for (const friendPrayer of friendPrayersSnap.docs) {
        await friendPrayer.ref.delete();
      }
    }
  }
);

// ── Claude AI Proxy ───────────────────────────────────────────────────────────
const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const https = require("https");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

exports.claudeProxy = onCall(
  { secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");
    const { prompt } = request.data;
    if (!prompt) throw new Error("No prompt provided");

    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(body)
        }
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          console.log("Anthropic status:", res.statusCode);
          console.log("Anthropic response:", data.slice(0, 500));
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              console.error("Anthropic error:", parsed.error);
              reject(new Error(parsed.error.message || "Anthropic API error"));
              return;
            }
            resolve({ text: parsed.content?.[0]?.text || "" });
          } catch (e) {
            console.error("Parse error:", e.message, "Raw:", data.slice(0, 200));
            reject(new Error("Failed to parse response"));
          }
        });
      });
      req.on("error", (e) => {
        console.error("Request error:", e.message);
        reject(e);
      });
      req.write(body);
      req.end();
    });
  }
);

// ---- Daily digest email (added by add_daily_digest.py) ----
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const DIGEST_TO = "smith.5939@gmail.com";
const DIGEST_FROM = "smith.5939@gmail.com";

exports.dailyDigest = onSchedule(
  {
    schedule: "every day 07:00",
    timeZone: "America/New_York",
    secrets: [gmailAppPassword],
  },
  async () => {
    const db = getFirestore();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const [newPrayers, answeredAll, prayedActions, totalUsers, activeToday] =
      await Promise.all([
        db.collection("prayers").where("createdAt", ">=", since).get(),
        db.collection("prayers").where("status", "==", "answered").get(),
        db.collection("prayingRecords").where("createdAt", ">=", since).get(),
        db.collection("users").count().get(),
        db.collection("dailyActivity").where("date", "==", today).get(),
      ]);

    const row = (label, value) =>
      `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #A8B89A;">${label}</td>
        <td style="padding:8px 0;border-bottom:1px solid #A8B89A;
            text-align:right;font-weight:bold;color:#6B8F71;">${value}</td>
      </tr>`;

    const html = `
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;
                  background:#F0EDE8;padding:24px;border-radius:12px;color:#1A1918;">
        <h2 style="color:#6B8F71;margin-top:0;">🕊️ LIFT Daily Digest</h2>
        <p style="color:#2C2C2A;">${new Date().toLocaleDateString("en-US",
          { weekday: "long", month: "long", day: "numeric" })}</p>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Total users", totalUsers.data().count)}
          ${row("Active users today", activeToday.size)}
          ${row("Prayers added (24h)", newPrayers.size)}
          ${row("Answered prayers (all time)", answeredAll.size)}
          ${row("'I'm Praying' taps (24h)", prayedActions.size)}
        </table>
      </div>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: DIGEST_FROM, pass: gmailAppPassword.value() },
    });

    await transporter.sendMail({
      from: `"LIFT Digest" <${DIGEST_FROM}>`,
      to: DIGEST_TO,
      subject: `LIFT Daily: ${newPrayers.size} new prayers, ${prayedActions.size} prayer taps`,
      html,
    });

    console.log("Daily digest sent.");
  }
);
// ---- end daily digest ----
