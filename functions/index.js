const { setGlobalOptions } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
setGlobalOptions({ maxInstances: 10 });

const db = getFirestore();

// ── Helper: send FCM notification to a user ──────────────────────────────────
async function sendNotificationToUser(userId, title, body) {
  const tokensSnap = await db
    .collection("fcmTokens")
    .where("userId", "==", userId)
    .get();

  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map((d) => d.data().token);
  const message = {
    notification: { title, body },
    tokens,
  };

  try {
    await getMessaging().sendEachForMulticast(message);
  } catch (e) {
    console.error("FCM error:", e);
  }
}

// ── 1. Daily inactivity reminder ─────────────────────────────────────────────
// Runs every day at 10am UTC (adjust for your user base)
exports.dailyPrayerReminder = onSchedule("every day 10:00", async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;

    // Check last activity
    const activitySnap = await db
      .collection("userActivity")
      .doc(userId)
      .get();

    const lastActive = activitySnap.exists
      ? new Date(activitySnap.data().lastActive)
      : null;

    // If no activity in 24 hours, send reminder
    if (!lastActive || lastActive < cutoff) {
      await sendNotificationToUser(
        userId,
        "🙏 Time to pray",
        "Your prayer list is waiting. Take a moment to lift them up."
      );
    }
  }
});

// ── 2. Prayer date reminder ───────────────────────────────────────────────────
// Runs every day at 8am UTC, checks for prayers with tomorrow's date
exports.prayerDateReminder = onSchedule("every day 08:00", async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const prayersSnap = await db
    .collection("prayers")
    .where("prayerDate", "==", tomorrowStr)
    .where("status", "==", "active")
    .get();

  for (const prayerDoc of prayersSnap.docs) {
    const prayer = prayerDoc.data();

    // Notify the prayer owner
    await sendNotificationToUser(
      prayer.userId,
      "📅 Prayer date tomorrow",
      `"${prayer.title}" — tomorrow is the day. Praying with you.`
    );
  }
});

// ── 3. Friend request notification ───────────────────────────────────────────
exports.friendRequestNotification = onDocumentCreated(
  "friendRequests/{requestId}",
  async (event) => {
    const request = event.data.data();
    if (!request || request.status !== "pending") return;

    await sendNotificationToUser(
      request.toUid,
      "👥 New friend request",
      `${request.fromName || "Someone"} wants to pray with you on LIFT.`
    );
  }
);