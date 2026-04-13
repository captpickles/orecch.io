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

Default DB URL is already set in [`src/config.js`](/Users/bob/repos/captpickles/orecch.io/src/config.js).

- Change mode in the page UI: `Firebase SDK`, `Firebase REST + auth token`, or `JSON export`.
- Optional auth token is entered in the page and saved to localStorage (`orecchio.authToken`).
- To change DB URL or JSON file paths, edit [`src/config.js`](/Users/bob/repos/captpickles/orecch.io/src/config.js).

## Deploy

This repo is static. Host directly from root on `main` branch in GitHub Pages settings.
