window.ORECCHIO_CONFIG = {
  dataMode: "firebase-sdk",
  lookbackDays: 7,
  pollMs: 30000,
  firebase: {
    databaseURL: "https://orecchio-2fc2d-default-rtdb.firebaseio.com/",
    apiKey: "",
    authDomain: "",
    projectId: "",
    appId: "",
    customAuthToken: ""
  },
  rest: {
    databaseURL: "https://orecchio-2fc2d-default-rtdb.firebaseio.com/",
    authToken: ""
  },
  json: {
    dailySummaryUrl: "./data/daily_summary.json",
    eventsUrl: "./data/events.json"
  },
  daylight: {
    startHour: 8,
    endHour: 20
  }
};
