const { setGlobalOptions } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const webpush = require("web-push");

initializeApp();
setGlobalOptions({ maxInstances: 10 });
const db = getFirestore();

const VAPID_PUBLIC = "BPUZCKpCFVDRD8xxpwxURabMud5HsEhcLdpnRXh7yLMENcegDeTuGJbN9hMwue4mKJIoq_tQrTUZpYxJJK5n_So";
const VAPID_PRIVATE = "xr3Ga8Yj2WGonS1RfgbIUn8rN1Ox2CBP5V_QjWI5Gi8";

webpush.setVapidDetails("mailto:smith.5939@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

async function sendPushToUser(userId, title, body, type = "general") {
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
