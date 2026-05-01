import {
  initializeApp,
  getApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  query,
  orderByChild,
  equalTo,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function createFirebaseSdkClient(firebaseConfig) {
  const appConfig = {
    databaseURL: firebaseConfig.databaseURL
  };
  if (firebaseConfig.apiKey) appConfig.apiKey = firebaseConfig.apiKey;
  if (firebaseConfig.authDomain) appConfig.authDomain = firebaseConfig.authDomain;
  if (firebaseConfig.projectId) appConfig.projectId = firebaseConfig.projectId;
  if (firebaseConfig.appId) appConfig.appId = firebaseConfig.appId;

  const app = getApps().length ? getApp() : initializeApp(appConfig);
  const db = getDatabase(app);
  let auth = null;

  async function maybeAuthenticate() {
    if (!firebaseConfig.customAuthToken) return;
    if (!firebaseConfig.apiKey) {
      throw new Error(
        "Firebase custom token auth requires firebase.apiKey in src/config.js or window.ORECCHIO_CONFIG."
      );
    }
    if (!auth) {
      auth = getAuth(app);
    }
    await signInWithCustomToken(auth, firebaseConfig.customAuthToken);
  }

  async function getDailySummary(siteId = "") {
    await maybeAuthenticate();
    const snapshot = await get(ref(db, getDailySummaryPath(siteId)));
    return snapshot.val() || {};
  }

  async function getEventsByDate(dateKey, siteId = "") {
    await maybeAuthenticate();
    const eventsRef = query(
      ref(db, getEventsPath(siteId)),
      orderByChild("date_utc"),
      equalTo(dateKey)
    );
    const snapshot = await get(eventsRef);
    return normalizeEvents(snapshot.val());
  }

  async function getBirdDetections(siteId = "") {
    if (!siteId) return [];
    await maybeAuthenticate();
    const snapshot = await get(ref(db, getBirdsPath(siteId)));
    return normalizeEvents(snapshot.val());
  }

  async function getSiteIds() {
    await maybeAuthenticate();
    const snapshot = await get(ref(db, "orecchio_sites"));
    const raw = snapshot.val() || {};
    return Object.keys(raw).sort();
  }

  function subscribeEventsByDate(dateKey, callback, siteId = "") {
    const eventsRef = query(
      ref(db, getEventsPath(siteId)),
      orderByChild("date_utc"),
      equalTo(dateKey)
    );
    let cancelled = false;
    let detach = null;
    maybeAuthenticate()
      .then(() => {
        if (cancelled) return;
        detach = onValue(eventsRef, (snap) => {
          callback(normalizeEvents(snap.val()));
        });
      })
      .catch((err) => {
        console.error("auth error", err);
      });
    return () => {
      cancelled = true;
      if (detach) {
        detach();
      }
    };
  }

  function subscribeBirdDetections(callback, siteId = "") {
    if (!siteId) {
      callback([]);
      return () => {};
    }
    const birdsRef = ref(db, getBirdsPath(siteId));
    let cancelled = false;
    let detach = null;
    maybeAuthenticate()
      .then(() => {
        if (cancelled) return;
        detach = onValue(birdsRef, (snap) => {
          callback(normalizeEvents(snap.val()));
        });
      })
      .catch((err) => {
        console.error("auth error", err);
      });
    return () => {
      cancelled = true;
      if (detach) {
        detach();
      }
    };
  }

  return {
    getDailySummary,
    getEventsByDate,
    subscribeEventsByDate,
    getBirdDetections,
    subscribeBirdDetections,
    getSiteIds
  };
}

function normalizeEvents(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).map(([id, value]) => ({ id, ...value }));
}

function getSitePrefix(siteId) {
  return siteId ? `orecchio_sites/${siteId}` : "";
}

function getDailySummaryPath(siteId) {
  const prefix = getSitePrefix(siteId);
  return prefix ? `${prefix}/daily_summary` : "daily_summary";
}

function getEventsPath(siteId) {
  const prefix = getSitePrefix(siteId);
  return prefix ? `${prefix}/events` : "events";
}

function getBirdsPath(siteId) {
  const prefix = getSitePrefix(siteId);
  return `${prefix}/birds`;
}
