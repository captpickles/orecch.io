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

  async function getDailySummary() {
    const url = withAuth(`${baseUrl}/daily_summary.json`, authToken);
    return (await fetchJson(url)) || {};
  }

  async function getEventsByDate(dateKey) {
    const query = `orderBy="date_utc"&equalTo="${dateKey}"`;
    const url = withAuth(`${baseUrl}/events.json?${query}`, authToken);
    const payload = await fetchJson(url);
    return normalizeEvents(payload);
  }

  function subscribeEventsByDate(_dateKey, _callback) {
    return () => {};
  }

  return {
    getDailySummary,
    getEventsByDate,
    subscribeEventsByDate
  };
}
