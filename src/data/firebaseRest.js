function withAuth(url, authToken) {
  if (!authToken) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}auth=${encodeURIComponent(authToken)}`;
}

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

export function createFirebaseRestClient(config) {
  const baseUrl = config.databaseURL.replace(/\/$/, "");
  const authToken = config.authToken;

  async function getDailySummary(siteId = "") {
    const path = siteId ? `orecchio_sites/${siteId}/daily_summary` : "daily_summary";
    const url = withAuth(`${baseUrl}/${path}.json`, authToken);
    return (await fetchJson(url)) || {};
  }

  async function getEventsByDate(dateKey, siteId = "") {
    const path = siteId ? `orecchio_sites/${siteId}/events` : "events";
    const query = `orderBy="date_utc"&equalTo="${dateKey}"`;
    const url = withAuth(`${baseUrl}/${path}.json?${query}`, authToken);
    const payload = await fetchJson(url);
    return normalizeEvents(payload);
  }

  async function getBirdDetections(siteId = "") {
    if (!siteId) return [];
    const path = `orecchio_sites/${siteId}/birds`;
    const url = withAuth(`${baseUrl}/${path}.json`, authToken);
    const payload = await fetchJson(url);
    return normalizeEvents(payload);
  }

  async function getSiteIds() {
    const url = withAuth(`${baseUrl}/orecchio_sites.json`, authToken);
    const payload = await fetchJson(url);
    return Object.keys(payload || {}).sort();
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
