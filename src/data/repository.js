import { createFirebaseSdkClient } from "./firebaseSdk.js";
import { createFirebaseRestClient } from "./firebaseRest.js";
import { createJsonClient } from "./jsonClient.js";
import { eachDate, toDateKey, addDays, getEasternDateKeyFromIso } from "../utils/date.js";

export function createRepository(config, options = {}) {
  const mode = config.dataMode;
  const siteId = options.siteId || "";
  const useSiteNamespace = Boolean(siteId);
  const client =
    mode === "firebase-rest"
      ? createFirebaseRestClient(config.rest)
      : mode === "json"
        ? createJsonClient(config.json)
        : createFirebaseSdkClient(config.firebase);

  async function getSummaryRows(startDate, endDate) {
    try {
      return await getSummaryRowsFromEvents(startDate, endDate);
    } catch (eventsError) {
      console.warn("events-based summary failed; falling back to daily_summary", eventsError);
      return await getSummaryRowsFromDailySummary(startDate, endDate);
    }
  }

  async function getSummaryRowsFromEvents(startDate, endDate) {
    const rows = [];
    const types = new Set();
    const localDateKeys = eachDate(startDate, endDate).map((date) => toDateKey(date));
    const utcFetchKeys = buildUtcFetchKeys(startDate, endDate);
    const allEventsByUtcDay = await Promise.all(
      utcFetchKeys.map((dateKey) => client.getEventsByDate(dateKey, siteId))
    );
    const flatEvents = allEventsByUtcDay.flat();

    localDateKeys.forEach((dateKey) => {
      const counts = {};
      const durations = {};
      const events = flatEvents.filter(
        (event) => getEasternDateKeyFromIso(event.start_utc) === dateKey
      );
      events.forEach((event) => {
        const type = event.event_type;
        if (!type) return;
        types.add(type);
        counts[type] = (counts[type] || 0) + 1;
        durations[type] = (durations[type] || 0) + Number(event.duration_seconds || 0);
      });
      rows.push({ dateKey, counts, durations });
    });

    return {
      rows,
      eventTypes: [...types].sort()
    };
  }

  async function getSummaryRowsFromDailySummary(startDate, endDate) {
    const dailySummary = await client.getDailySummary(siteId);
    const rows = [];
    const types = new Set();
    for (const date of eachDate(startDate, endDate)) {
      const dateKey = toDateKey(date);
      const dayNode = dailySummary[dateKey] || {};
      const counts = {};
      const durations = {};
      Object.values(dayNode).forEach((entry) => {
        if (!entry || !entry.event_type) return;
        const type = entry.event_type;
        types.add(type);
        counts[type] = entry.event_count || 0;
        durations[type] = entry.total_duration_seconds || 0;
      });
      rows.push({
        dateKey,
        counts,
        durations
      });
    }
    return {
      rows,
      eventTypes: [...types].sort()
    };
  }

  async function getDayEvents(dateKey) {
    const targetDate = new Date(`${dateKey}T00:00:00`);
    const utcKeys = [
      addDays(targetDate, -1),
      targetDate,
      addDays(targetDate, 1)
    ].map((date) => toUtcDateKey(date));
    const dedupedKeys = [...new Set(utcKeys)];
    const byUtcDay = await Promise.all(
      dedupedKeys.map((utcDateKey) => client.getEventsByDate(utcDateKey, siteId))
    );
    const events = byUtcDay
      .flat()
      .filter((event) => getEasternDateKeyFromIso(event.start_utc) === dateKey);
    return events.sort((a, b) => {
      const aTime = new Date(a.start_utc).getTime();
      const bTime = new Date(b.start_utc).getTime();
      return aTime - bTime;
    });
  }

  function subscribeDayEvents(dateKey, callback) {
    return client.subscribeEventsByDate(dateKey, callback, siteId);
  }

  async function getBirdDetectionsForDay(dateKey) {
    if (!useSiteNamespace) return [];
    const allDetections = await client.getBirdDetections(siteId);
    return allDetections
      .filter((detection) => getLocalDateKeyFromIso(detection.start_utc) === dateKey)
      .sort((a, b) => new Date(a.start_utc) - new Date(b.start_utc));
  }

  function subscribeBirdDetectionsForDay(dateKey, callback) {
    if (!useSiteNamespace) {
      callback([]);
      return () => {};
    }
    return client.subscribeBirdDetections((allDetections) => {
      const detections = allDetections
        .filter((detection) => getLocalDateKeyFromIso(detection.start_utc) === dateKey)
        .sort((a, b) => new Date(a.start_utc) - new Date(b.start_utc));
      callback(detections);
    }, siteId);
  }

  async function getSiteIds() {
    if (typeof client.getSiteIds !== "function") return [];
    return client.getSiteIds();
  }

  return {
    mode,
    siteId,
    useSiteNamespace,
    getSummaryRows,
    getDayEvents,
    subscribeDayEvents,
    getBirdDetectionsForDay,
    subscribeBirdDetectionsForDay,
    getSiteIds
  };
}

function buildUtcFetchKeys(startDate, endDate) {
  const fetchStart = addDays(startDate, -1);
  const fetchEnd = addDays(endDate, 1);
  const keys = eachDate(fetchStart, fetchEnd).map((date) => toUtcDateKey(date));
  return [...new Set(keys)];
}

function toUtcDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function getLocalDateKeyFromIso(isoValue) {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
}
