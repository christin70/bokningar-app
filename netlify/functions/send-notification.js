const admin = require("firebase-admin");

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return admin;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const firebase = getFirebaseAdmin();

    const authorization =
      event.headers.authorization ||
      event.headers.Authorization ||
      "";

    if (!authorization.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Inloggning krävs" }),
      };
    }

    const decoded = await firebase.auth().verifyIdToken(
      authorization.slice(7)
    );

    const { bookingId } = JSON.parse(event.body || "{}");

    if (typeof bookingId !== "string" || !bookingId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Boknings-ID saknas" }),
      };
    }

    const db = firebase.firestore();
    const bookingSnap = await db
      .collection("bookings")
      .doc(bookingId)
      .get();

    if (!bookingSnap.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Bokningen finns inte" }),
      };
    }

    const booking = bookingSnap.data();

    if (booking.userId !== decoded.uid) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Inte din bokning" }),
      };
    }

    const notificationRef = db
      .collection("sentNotifications")
      .doc(bookingId);

    const claimed = await db.runTransaction(async (tx) => {
      const existing = await tx.get(notificationRef);

      if (existing.exists) return false;

      tx.create(notificationRef, {
        bookingId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      return true;
    });

    if (!claimed) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          alreadyProcessed: true,
        }),
      };
    }

    const tokensSnap = await db.collection("pushTokens").get();
    const tokens = [];

    tokensSnap.forEach((doc) => {
      if (doc.id !== decoded.uid) {
        const token = doc.data().token;

        if (typeof token === "string" && token) {
          tokens.push(token);
        }
      }
    });

    if (tokens.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, sent: 0 }),
      };
    }

    const title = "Ny bokning i Familjebokningar";
    const body = `${booking.displayName || "Någon"} har gjort en bokning.`;

    const result = await firebase.messaging().sendEachForMulticast({
      tokens: [...new Set(tokens)],
      notification: { title, body },
      webpush: {
        notification: { title, body },
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        sent: result.successCount,
      }),
    };
  } catch (error) {
    console.error("Push error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "Serverfel",
      }),
    };
  }
};