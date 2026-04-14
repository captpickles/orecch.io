# Orecchio Static Dashboard

No-build, GitHub-Pages-friendly dashboard that reads sound events from Firebase Realtime Database and renders D3 charts client-side.

## What this includes

- Past 7 days stacked bar chart of event counts by type (`/daily_summary/{date}/{event_type}`)
- Day timeline dot chart from `/events`
- Click any day in the summary chart to explode that day's timeline
- Date range + event-type filters
- Today live updates in `firebase-sdk` mode (`onValue` listener)
- Optional `firebase-rest` mode with `?auth=` token
- Optional `json` mode using static files in [`data/`](/Users/bob/repos/captpickles/orecch.io/data)

## Run locally

`file://` is not reliable for module imports. Use a tiny static server:

```bash
cd /Users/bob/repos/captpickles/orecch.io
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Configure data source

Edit [`config/site-config.js`](/Users/bob/repos/captpickles/orecch.io/config/site-config.js) for your instance:

- `dataMode`: `firebase-sdk`, `firebase-rest`, or `json`
- `firebase.databaseURL` and `rest.databaseURL`
- Optional auth fields (`firebase.customAuthToken` or `rest.authToken`)
- Optional Firebase SDK app metadata (`apiKey`, `authDomain`, `projectId`, `appId`) when auth is used
- `daylight.startHour` and `daylight.endHour` for timeline daylight shading

## Deploy

This repo is static. Host directly from root on `main` branch in GitHub Pages settings.
