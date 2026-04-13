const windowConfig = window.ORECCHIO_CONFIG || {};

export const config = {
  dataMode: windowConfig.dataMode || "firebase-sdk",
  lookbackDays: windowConfig.lookbackDays || 7,
  pollMs: windowConfig.pollMs || 30000,
  firebase: {
    databaseURL:
      windowConfig.firebase?.databaseURL ||
      "https://orecchio-2fc2d-default-rtdb.firebaseio.com/",
    apiKey: windowConfig.firebase?.apiKey || "",
    authDomain: windowConfig.firebase?.authDomain || "",
    projectId: windowConfig.firebase?.projectId || "",
    appId: windowConfig.firebase?.appId || "",
    customAuthToken: windowConfig.firebase?.customAuthToken || ""
  },
  rest: {
    databaseURL:
      windowConfig.rest?.databaseURL ||
      "https://orecchio-2fc2d-default-rtdb.firebaseio.com/",
    authToken: windowConfig.rest?.authToken || ""
  },
  json: {
    dailySummaryUrl:
      windowConfig.json?.dailySummaryUrl || "./data/daily_summary.json",
    eventsUrl: windowConfig.json?.eventsUrl || "./data/events.json"
  }
};
