const admin = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
function getFirebaseAdmin() {
  if (!admin.getApps().length) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

    admin.initializeApp({
  credential: admin.cert(serviceAccount),
    });
  }

  return admin.getApp();
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
const adminAuth = getAuth(firebase);
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

    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7)
    );

    const { bookingId, type } = JSON.parse(event.body || "{}");

    const isCancellation = type === "cancel";


    if (typeof bookingId !== "string" || !bookingId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Boknings-ID saknas" }),
      };
    }

    const db = getFirestore(firebase);

    // Avbokning sker på servern: kontrollera ägare och ta bort bokning/lås atomärt.
    // En outbox-post bevarar informationen tills notisen har skickats.
    if (isCancellation) {
      const bookingRef = db.collection("bookings").doc(bookingId);
      const noticeRef = db.collection("sentNotifications").doc(`${bookingId}_cancel`);
      const outcome = await db.runTransaction(async (tx) => {
        const [bookingSnap, noticeSnap] = await Promise.all([
          tx.get(bookingRef), tx.get(noticeRef)
        ]);
        if (noticeSnap.exists) {
          const saved = noticeSnap.data();
          if (saved.userId !== decoded.uid) return { forbidden: true };
          return { notice: saved, alreadyCancelled: true };
        }
        if (!bookingSnap.exists) return { missing: true };
        const booking = bookingSnap.data();
        if (booking.userId !== decoded.uid) return { forbidden: true };
        const days = [];
        const current = new Date(`${booking.start}T12:00:00Z`);
        const last = new Date(`${booking.end}T12:00:00Z`);
        if (!Number.isFinite(current.getTime()) || !Number.isFinite(last.getTime()) ||
            last < current || (last-current)/86400000 > 366) return { invalid: true };
        for (; current <= last; current.setUTCDate(current.getUTCDate()+1)) {
          days.push(current.toISOString().slice(0,10));
        }
        const lockRefs = days.map(day =>
          db.collection("bookingLocks").doc(`${booking.resourceId}__${day}`));
        const lockSnaps = [];
        for (const ref of lockRefs) lockSnaps.push(await tx.get(ref));
        tx.delete(bookingRef);
        lockRefs.forEach((ref,i) => {
          if (lockSnaps[i].exists && lockSnaps[i].data().bookingId === bookingId) tx.delete(ref);
        });
        const notice = {bookingId, userId: decoded.uid,
          displayName: booking.displayName || "Någon", status: "pending",
          createdAt: FieldValue.serverTimestamp()};
        tx.create(noticeRef, notice);
        return {notice};
      });
      if (outcome.forbidden) return {statusCode:403,body:JSON.stringify({error:"Inte din bokning"})};
      if (outcome.missing) return {statusCode:404,body:JSON.stringify({error:"Bokningen finns inte"})};
      if (outcome.invalid) return {statusCode:400,body:JSON.stringify({error:"Ogiltiga bokningsdatum"})};
      if (outcome.notice.status === "sent") return {statusCode:200,body:JSON.stringify({ok:true,alreadyProcessed:true})};

      // Förhindra samtidiga dubbla utskick med ett kortvarigt lås.
      const claim = await db.runTransaction(async tx => {
        const snap = await tx.get(noticeRef);
        const n = snap.data();
        if (n.status === "sent") return false;
        if (n.status === "sending" && n.leaseUntil > Date.now()) return false;
        tx.update(noticeRef, {status:"sending",leaseUntil:Date.now()+60000});
        return true;
      });
      if (!claim) return {statusCode:200,body:JSON.stringify({ok:true,notificationPending:true})};
      try {
        const tokensSnap = await db.collection("pushTokens").get();
        const tokens = [];
        tokensSnap.forEach(doc => {
          if (doc.id !== decoded.uid && typeof doc.data().token === "string" && doc.data().token)
            tokens.push(doc.data().token);
        });
        let sent = 0;
        if (tokens.length) {
          const result = await getMessaging(firebase).sendEachForMulticast({
            tokens:[...new Set(tokens)],
            notification:{title:"Avbokning i Familjebokningar",
              body:`${outcome.notice.displayName} har avbokat en bokning.`}
          });
          sent = result.successCount;
          if (result.failureCount && !result.successCount) throw new Error("Inga notiser kunde levereras");
        }
        await noticeRef.update({status:"sent",sent,leaseUntil:0});
        return {statusCode:200,body:JSON.stringify({ok:true,sent})};
      } catch (notificationError) {
        console.error("Avbokning klar, men notis misslyckades:",notificationError);
        await noticeRef.update({status:"pending",leaseUntil:0}).catch(console.error);
        return {statusCode:200,body:JSON.stringify({ok:true,notificationPending:true})};
      }
    }

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
     .doc(isCancellation ? `${bookingId}_cancel` : bookingId);

    const claimed = await db.runTransaction(async (tx) => {
      const existing = await tx.get(notificationRef);

      if (existing.exists) return false;

      tx.create(notificationRef, {
        bookingId,
        createdAt: FieldValue.serverTimestamp(),
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

    const title = isCancellation ? "Avbokning i Familjebokningar" : "Ny bokning i Familjebokningar";
    const body = isCancellation
  ? `${booking.displayName || "Någon"} har avbokat en bokning.`
  : `${booking.displayName || "Någon"} har gjort en bokning.`;

    const result = await getMessaging(firebase).sendEachForMulticast({
      tokens: [...new Set(tokens)],
      notification: { title, body },
      
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