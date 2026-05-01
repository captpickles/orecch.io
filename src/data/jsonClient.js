async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function normalizeEvents(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).map(([id, value]) => ({ id, ...value }));
}

export function createJsonClient(config) {
  async function getDailySummary() {
    const data = await fetchJson(config.dailySummaryUrl);
    return data || {};
  }

  async function getEventsByDate(dateKey) {
    const data = await fetchJson(config.eventsUrl);
    const all = normalizeEvents(data);
    return all.filter((event) => event.date_utc === dateKey);
  }

  async function getBirdDetections(_siteId = "") {
    return [];
  }

  async function getSiteIds() {
    return [];
  }

  function subscribeEventsByDate(_dateKey, _callback, _siteId = "") {
    return () => {};
  }

  function subscribeBirdDetections(_callback, _siteId = "") {
    return () => {};
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
