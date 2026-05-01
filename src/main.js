import { config as appConfig } from "./config.js";
import { createRepository } from "./data/repository.js";
import { renderSummaryChart } from "./charts/summaryChart.js";
import { renderTimelineChart } from "./charts/timelineChart.js";
import { renderBirdHeatmapChart } from "./charts/birdHeatmapChart.js";
import { renderChartPlaceholder } from "./charts/placeholder.js";
import { renderEventTypeFilters } from "./ui/controls.js";
import { renderTypeLegend } from "./ui/legend.js";
import { clampDateRange, addDays, getTodayKey, toDateKey, parseIsoLocal } from "./utils/date.js";

const route = parseRoute(resolveRoutePath());

const elements = {
  subhead: document.querySelector("#subhead"),
  routeNote: document.querySelector("#route-note"),
  dashboardView: document.querySelector("#dashboard-view"),
  birdsView: document.querySelector("#birds-view"),
  siteIndexView: document.querySelector("#site-index-view"),
  startDate: document.querySelector("#start-date"),
  endDate: document.querySelector("#end-date"),
  eventTypeFilters: document.querySelector("#event-type-filters"),
  summaryChart: document.querySelector("#summary-chart"),
  summaryLegend: document.querySelector("#summary-legend"),
  timelineChart: document.querySelector("#timeline-chart"),
  timelineLegend: document.querySelector("#timeline-legend"),
  status: document.querySelector("#status"),
  selectedDayLabel: document.querySelector("#selected-day-label"),
  birdsDate: document.querySelector("#birds-date"),
  birdsStatus: document.querySelector("#birds-status"),
  birdsChart: document.querySelector("#birds-chart"),
  birdsSelectedDayLabel: document.querySelector("#birds-selected-day-label"),
  birdsNowSnapshot: document.querySelector("#birds-now-snapshot"),
  birdsDailyList: document.querySelector("#birds-daily-list"),
  siteIndexStatus: document.querySelector("#site-index-status"),
  siteIndexList: document.querySelector("#site-index-list"),
  lastUpdated: document.querySelector("#last-updated"),
  themeToggle: document.querySelector("#theme-toggle")
};

const state = {
  route,
  repository: null,
  startKey: "",
  endKey: "",
  selectedDayKey: "",
  summaryRows: [],
  eventTypes: [],
  selectedEventTypes: new Set(),
  dayEvents: [],
  birdDayKey: "",
  birdDetections: [],
  birdSpecies: [],
  selectedBirdSpecies: new Set(),
  birdBuckets: [],
  birdDailyRows: [],
  unsubscribeLive: null,
  pollTimer: null,
  nowTickTimer: null,
  nowTickFn: null,
  isActivelyUpdatingToday: false,
  nowMs: Date.now()
};

init();

async function init() {
  const today = new Date();
  state.endKey = toDateKey(today);
  state.startKey = toDateKey(addDays(today, -(appConfig.lookbackDays - 1)));
  state.selectedDayKey = state.endKey;
  state.birdDayKey = state.endKey;

  applyRouteShell();
  wireControls();
  wireThemeToggle();
  syncDateInputs();
  await reloadAll();
  window.addEventListener("resize", debounce(onResize, 120));
}

function applyRouteShell() {
  if (
    state.route.kind === "legacy-root" ||
    state.route.kind === "site-dashboard" ||
    state.route.kind === "site-birds"
  ) {
    document.body.setAttribute("data-mode", "site");
  } else {
    document.body.removeAttribute("data-mode");
  }

  if (elements.subhead) {
    if (state.route.kind === "site-birds") {
      elements.subhead.textContent = `Bird Detections Dashboard: ${state.route.siteId}`;
    } else if (state.route.kind === "site-dashboard") {
      elements.subhead.textContent = `Acoustic Events Dashboard: ${state.route.siteId}`;
    } else {
      elements.subhead.textContent = "Orecchio Site Index";
    }
  }

  if (elements.routeNote) {
    if (state.route.kind === "site-dashboard" || state.route.kind === "site-birds") {
      const site = encodeURIComponent(state.route.siteId);
      const nuisanceHref = `/${site}/`;
      const birdsHref = `/${site}/birds`;
      const nuisanceLabel =
        state.route.kind === "site-dashboard" ? "<strong>Nuisance</strong>" : "Nuisance";
      const birdsLabel =
        state.route.kind === "site-birds" ? "<strong>Birds</strong>" : "Birds";
      elements.routeNote.innerHTML = `<a href="${nuisanceHref}">${nuisanceLabel}</a><span class="route-sep"> · </span><a href="${birdsHref}">${birdsLabel}</a>`;
    } else {
      elements.routeNote.textContent = "";
    }
  }

  if (elements.dashboardView) {
    elements.dashboardView.classList.toggle("hidden", state.route.kind !== "site-dashboard");
  }
  if (elements.birdsView) {
    elements.birdsView.classList.toggle("hidden", state.route.kind !== "site-birds");
  }
  if (elements.siteIndexView) {
    elements.siteIndexView.classList.toggle("hidden", state.route.kind !== "legacy-root");
  }
}

function wireControls() {
  if (elements.startDate) {
    elements.startDate.addEventListener("change", async () => {
      state.startKey = elements.startDate.value || state.startKey;
      const clamped = clampDateRange(state.startKey, state.endKey, 31);
      state.startKey = clamped.startKey;
      state.endKey = clamped.endKey;
      syncDateInputs();
      await reloadSummary();
    });
  }

  if (elements.endDate) {
    elements.endDate.addEventListener("change", async () => {
      state.endKey = elements.endDate.value || state.endKey;
      const clamped = clampDateRange(state.startKey, state.endKey, 31);
      state.startKey = clamped.startKey;
      state.endKey = clamped.endKey;
      syncDateInputs();
      await reloadSummary();
    });
  }

  if (elements.birdsDate) {
    elements.birdsDate.addEventListener("change", async () => {
      state.birdDayKey = elements.birdsDate.value || state.birdDayKey;
      elements.birdsDate.value = state.birdDayKey;
      await loadBirdDay();
    });
  }
}

async function reloadAll() {
  cleanupRealtime();
  if (state.route.kind === "unsupported") {
    setStatus("Unknown path. Use /, /<site-id>/, or /<site-id>/birds.", "error");
    return;
  }

  const repoOptions =
    state.route.kind === "legacy-root" ? {} : { siteId: state.route.siteId };
  state.repository = createRepository(appConfig, repoOptions);

  if (state.route.kind === "legacy-root") {
    await loadSiteIndex();
    return;
  }
  if (state.route.kind === "site-birds") {
    await loadBirdDay();
    return;
  }
  await reloadSummary();
  await loadSelectedDayEvents();
}

async function loadSiteIndex() {
  if (!elements.siteIndexList || !elements.siteIndexStatus) return;
  try {
    setSiteIndexStatus("Loading sites...", "loading");
    const siteIds = await state.repository.getSiteIds();
    renderSiteIndex(siteIds);
    setSiteIndexStatus(siteIds.length ? `${siteIds.length} site(s) found.` : "No sites yet.", "ok");
    markLastUpdated();
  } catch (error) {
    console.error(error);
    setSiteIndexStatus(`Failed to load sites: ${error.message}`, "error");
    elements.siteIndexList.innerHTML = "";
  }
}

async function reloadSummary() {
  if (!elements.summaryChart) return;
  try {
    setStatus("Loading daily summaries...", "loading");
    renderChartPlaceholder(elements.summaryChart, "Loading 7-day summary...");
    const startDate = new Date(`${state.startKey}T00:00:00`);
    const endDate = new Date(`${state.endKey}T00:00:00`);
    const summaryResult = await state.repository.getSummaryRows(startDate, endDate);
    state.summaryRows = summaryResult.rows;
    mergeEventTypes(summaryResult.eventTypes);
    if (state.selectedDayKey < state.startKey || state.selectedDayKey > state.endKey) {
      state.selectedDayKey = state.endKey;
    }
    renderFilters();
    renderCharts();
    const hasAnySummary = state.summaryRows.some(
      (row) => Object.keys(row.durations || {}).length > 0
    );
    setStatus(hasAnySummary ? "Summary loaded." : "No data yet.", "ok");
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load summary: ${error.message}`, "error");
    renderChartPlaceholder(elements.summaryChart, "Could not load summary data.", "error");
  }
}

async function loadSelectedDayEvents() {
  cleanupRealtime();
  try {
    setStatus(`Loading events for ${state.selectedDayKey}...`, "loading");
    renderChartPlaceholder(elements.timelineChart, "Loading day timeline...");
    const events = await state.repository.getDayEvents(state.selectedDayKey);
    state.dayEvents = events;
    reconcileSelectedDaySummaryWithEvents();
    mergeEventTypes(uniqueTypes(events));
    renderFilters();
    renderCharts();
    markLastUpdated();
    setupRealtimeIfAvailable();
    if (!state.dayEvents.length) {
      setStatus("No data yet.", "ok");
    }
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load day events: ${error.message}`, "error");
    renderChartPlaceholder(elements.timelineChart, "Could not load day timeline.", "error");
  }
}

async function loadBirdDay() {
  cleanupRealtime();
  try {
    setBirdStatus(`Loading bird detections for ${state.birdDayKey}...`, "loading");
    renderChartPlaceholder(elements.birdsChart, "Loading bird occupancy...");
    const detections = await state.repository.getBirdDetectionsForDay(state.birdDayKey);
    state.birdDetections = detections;
    const derived = deriveBirdDayMetrics(detections, state.birdDayKey, 15);
    const previousSpecies = state.birdSpecies;
    state.birdSpecies = derived.species;
    mergeBirdSpecies(derived.species, previousSpecies);
    state.birdBuckets = derived.buckets;
    state.birdDailyRows = derived.dailyRows;
    renderBirdView();
    markLastUpdated();
    setupBirdRealtimeIfAvailable();
    setBirdStatus(detections.length ? "Bird detections loaded." : "No data yet.", "ok");
  } catch (error) {
    console.error(error);
    setBirdStatus(`Failed to load bird detections: ${error.message}`, "error");
    renderChartPlaceholder(elements.birdsChart, "Could not load bird data.", "error");
  }
}

function setupRealtimeIfAvailable() {
  const isToday = state.selectedDayKey === getTodayKey();
  if (!isToday) {
    state.isActivelyUpdatingToday = false;
    stopNowTicker();
    setStatus(`Showing ${state.selectedDayKey}.`, "ok");
    return;
  }

  if (state.repository.mode === "firebase-sdk") {
    state.isActivelyUpdatingToday = true;
    startNowTicker(renderCharts);
    state.unsubscribeLive = state.repository.subscribeDayEvents(
      state.selectedDayKey,
      (events) => {
        state.dayEvents = events.sort((a, b) => new Date(a.start_utc) - new Date(b.start_utc));
        reconcileSelectedDaySummaryWithEvents();
        mergeEventTypes(uniqueTypes(state.dayEvents));
        renderFilters();
        renderCharts();
        markLastUpdated();
        setStatus("Live updates active for today.", "ok");
      }
    );
    setStatus("Listening for live updates on today's events...", "loading");
    return;
  }

  state.isActivelyUpdatingToday = true;
  startNowTicker(renderCharts);
  state.pollTimer = setInterval(async () => {
    try {
      state.dayEvents = await state.repository.getDayEvents(state.selectedDayKey);
      reconcileSelectedDaySummaryWithEvents();
      renderCharts();
      markLastUpdated();
    } catch (err) {
      console.error("poll error", err);
    }
  }, appConfig.pollMs);
  setStatus(`Polling today's events every ${Math.round(appConfig.pollMs / 1000)}s.`, "loading");
}

function setupBirdRealtimeIfAvailable() {
  const isToday = state.birdDayKey === getTodayKey();
  if (!isToday) {
    state.isActivelyUpdatingToday = false;
    stopNowTicker();
    setBirdStatus(`Showing ${state.birdDayKey}.`, "ok");
    return;
  }

  if (state.repository.mode === "firebase-sdk") {
    state.isActivelyUpdatingToday = true;
    startNowTicker(renderBirdView);
    state.unsubscribeLive = state.repository.subscribeBirdDetectionsForDay(
      state.birdDayKey,
      (detections) => {
        state.birdDetections = detections;
        const derived = deriveBirdDayMetrics(detections, state.birdDayKey, 15);
        const previousSpecies = state.birdSpecies;
        state.birdSpecies = derived.species;
        mergeBirdSpecies(derived.species, previousSpecies);
        state.birdBuckets = derived.buckets;
        state.birdDailyRows = derived.dailyRows;
        renderBirdView();
        markLastUpdated();
        setBirdStatus("Live bird updates active for today.", "ok");
      }
    );
    setBirdStatus("Listening for live bird updates...", "loading");
    return;
  }

  state.isActivelyUpdatingToday = true;
  startNowTicker(renderBirdView);
  state.pollTimer = setInterval(async () => {
    try {
      state.birdDetections = await state.repository.getBirdDetectionsForDay(state.birdDayKey);
      const derived = deriveBirdDayMetrics(state.birdDetections, state.birdDayKey, 15);
      const previousSpecies = state.birdSpecies;
      state.birdSpecies = derived.species;
      mergeBirdSpecies(derived.species, previousSpecies);
      state.birdBuckets = derived.buckets;
      state.birdDailyRows = derived.dailyRows;
      renderBirdView();
      markLastUpdated();
    } catch (err) {
      console.error("bird poll error", err);
    }
  }, appConfig.pollMs);
  setBirdStatus(`Polling today's birds every ${Math.round(appConfig.pollMs / 1000)}s.`, "loading");
}

function cleanupRealtime() {
  state.isActivelyUpdatingToday = false;
  if (state.unsubscribeLive) {
    state.unsubscribeLive();
    state.unsubscribeLive = null;
  }
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  stopNowTicker();
}

function renderFilters() {
  if (!elements.eventTypeFilters) return;
  renderEventTypeFilters(
    elements.eventTypeFilters,
    state.eventTypes,
    state.selectedEventTypes,
    renderCharts
  );
}

function renderCharts() {
  if (!elements.summaryChart || !elements.timelineChart) return;
  renderTypeLegend(elements.summaryLegend, state.eventTypes, state.selectedEventTypes);
  renderTypeLegend(elements.timelineLegend, state.eventTypes, state.selectedEventTypes);

  renderSummaryChart({
    container: elements.summaryChart,
    rows: state.summaryRows,
    eventTypes: state.eventTypes,
    selectedEventTypes: state.selectedEventTypes,
    selectedDayKey: state.selectedDayKey,
    onSelectDay: async (dateKey) => {
      state.selectedDayKey = dateKey;
      renderCharts();
      await loadSelectedDayEvents();
    }
  });

  renderTimelineChart({
    container: elements.timelineChart,
    events: state.dayEvents,
    eventTypes: state.eventTypes,
    selectedEventTypes: state.selectedEventTypes,
    selectedDayKey: state.selectedDayKey,
    daylightStartHour: appConfig.daylight.startHour,
    daylightEndHour: appConfig.daylight.endHour,
    showNowMarker: state.isActivelyUpdatingToday,
    nowMs: state.nowMs
  });
  if (elements.selectedDayLabel) {
    elements.selectedDayLabel.textContent = `Selected day: ${state.selectedDayKey}`;
  }
}

function renderBirdView() {
  if (!elements.birdsChart) return;
  const activeSpecies = new Set(state.birdSpecies);
  renderBirdHeatmapChart({
    container: elements.birdsChart,
    buckets: state.birdBuckets,
    species: state.birdSpecies,
    selectedSpecies: activeSpecies,
    bucketMinutes: 15,
    selectedDayKey: state.birdDayKey
  });
  if (elements.birdsSelectedDayLabel) {
    elements.birdsSelectedDayLabel.textContent = `Selected day: ${state.birdDayKey}`;
  }
  renderBirdDailyTable(
    elements.birdsDailyList,
    state.birdDailyRows
  );
  renderBirdSnapshotTable(
    elements.birdsNowSnapshot,
    deriveBirdSnapshotRows(state.birdDetections, state.nowMs).filter((row) =>
      activeSpecies.has(row.species)
    )
  );
}

function mergeEventTypes(nextTypes) {
  if (!nextTypes.length) return;
  const merged = new Set([...state.eventTypes, ...nextTypes]);
  state.eventTypes = [...merged].sort();

  if (state.selectedEventTypes.size === 0) {
    state.eventTypes.forEach((type) => state.selectedEventTypes.add(type));
    return;
  }
  const valid = new Set(state.eventTypes);
  [...state.selectedEventTypes].forEach((type) => {
    if (!valid.has(type)) state.selectedEventTypes.delete(type);
  });
  if (state.selectedEventTypes.size === 0) {
    state.eventTypes.forEach((type) => state.selectedEventTypes.add(type));
  }
}

function mergeBirdSpecies(species, previousSpecies = []) {
  if (!species.length) {
    state.selectedBirdSpecies.clear();
    return;
  }
  if (state.selectedBirdSpecies.size === 0) {
    species.forEach((name) => state.selectedBirdSpecies.add(name));
    return;
  }
  const valid = new Set(species);
  [...state.selectedBirdSpecies].forEach((name) => {
    if (!valid.has(name)) state.selectedBirdSpecies.delete(name);
  });

  const previous = new Set(previousSpecies);
  species.forEach((name) => {
    if (!previous.has(name)) {
      state.selectedBirdSpecies.add(name);
    }
  });

  if (state.selectedBirdSpecies.size === 0) {
    species.forEach((name) => state.selectedBirdSpecies.add(name));
  }
}

function uniqueTypes(events) {
  return [...new Set(events.map((evt) => evt.event_type).filter(Boolean))];
}

function reconcileSelectedDaySummaryWithEvents() {
  const row = state.summaryRows.find((entry) => entry.dateKey === state.selectedDayKey);
  if (!row) return;
  const counts = {};
  const durations = {};
  state.dayEvents.forEach((event) => {
    if (!parseIsoLocal(event.start_utc)) return;
    const type = event.event_type;
    if (!type) return;
    counts[type] = (counts[type] || 0) + 1;
    durations[type] = (durations[type] || 0) + Number(event.duration_seconds || 0);
  });
  row.counts = counts;
  row.durations = durations;
}

function syncDateInputs() {
  if (elements.startDate) elements.startDate.value = state.startKey;
  if (elements.endDate) elements.endDate.value = state.endKey;
  if (elements.birdsDate) elements.birdsDate.value = state.birdDayKey;
}

function setStatus(message, level = "ok") {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.className = `status ${level}`;
}

function setBirdStatus(message, level = "ok") {
  if (!elements.birdsStatus) return;
  elements.birdsStatus.textContent = message;
  elements.birdsStatus.className = `status ${level}`;
}

function setSiteIndexStatus(message, level = "ok") {
  if (!elements.siteIndexStatus) return;
  elements.siteIndexStatus.textContent = message;
  elements.siteIndexStatus.className = `status ${level}`;
}

function markLastUpdated() {
  const stamp = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
  if (elements.lastUpdated) {
    elements.lastUpdated.textContent = `Last updated: ${stamp}`;
  }
}

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

function wireThemeToggle() {
  updateThemeToggleLabel();
  if (!elements.themeToggle) return;
  elements.themeToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const nextTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", nextTheme);
    localStorage.setItem("orecchio.theme", nextTheme);
    updateThemeToggleLabel();
    if (state.route.kind === "site-birds") {
      renderBirdView();
    } else {
      renderCharts();
    }
  });
}

function updateThemeToggleLabel() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  if (elements.themeToggle) {
    elements.themeToggle.textContent = current === "dark" ? "Light mode" : "Dark mode";
  }
}

function startNowTicker(onTick) {
  state.nowMs = Date.now();
  state.nowTickFn = onTick;
  if (state.nowTickTimer) return;
  state.nowTickTimer = setInterval(() => {
    state.nowMs = Date.now();
    if (typeof state.nowTickFn === "function") {
      state.nowTickFn();
    }
  }, 60000);
}

function stopNowTicker() {
  if (!state.nowTickTimer) return;
  clearInterval(state.nowTickTimer);
  state.nowTickTimer = null;
  state.nowTickFn = null;
}

function onResize() {
  if (state.route.kind === "site-birds") {
    renderBirdView();
  } else {
    renderCharts();
  }
}

function renderBirdDailyTable(container, rows) {
  container.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted-note";
    empty.textContent = "No birds seen in this day yet.";
    container.append(empty);
    return;
  }
  const table = document.createElement("table");
  table.className = "birds-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Bird</th>
        <th>Count</th>
        <th>Time</th>
        <th>Trend</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const ebirdUrl = row.ebirdSpeciesCode
      ? `https://ebird.org/species/${encodeURIComponent(row.ebirdSpeciesCode)}`
      : "";
    const linksHtml = ebirdUrl
      ? `<a class="bird-name-link" href="${escapeHtml(ebirdUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.species)}</a>`
      : "";
    const speciesLabelHtml = linksHtml || `<span>${escapeHtml(row.species)}</span>`;
    const sparklineSvg = renderBirdSparklineSvg(row.species);
    tr.innerHTML = `
      <td>
        ${speciesLabelHtml}
      </td>
      <td>${row.count}</td>
      <td>${formatDurationCompact(row.occupiedSeconds)}</td>
      <td>${sparklineSvg}</td>
    `;
    tbody.append(tr);
  });
  container.append(table);
}

function renderBirdSnapshotTable(container, rows) {
  container.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted-note";
    empty.textContent = "No birds in the past 5 minutes.";
    container.append(empty);
    return;
  }
  const table = document.createElement("table");
  table.className = "birds-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Bird</th>
        <th>Hits</th>
        <th>Activity</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const ebirdUrl = row.ebirdSpeciesCode
      ? `https://ebird.org/species/${encodeURIComponent(row.ebirdSpeciesCode)}`
      : "";
    const linksHtml = ebirdUrl
      ? `<a class="bird-name-link" href="${escapeHtml(ebirdUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.species)}</a>`
      : "";
    const speciesLabelHtml = linksHtml || escapeHtml(row.species);
    tr.innerHTML = `
      <td>
        ${speciesLabelHtml}
      </td>
      <td>${row.count}</td>
      <td>${formatDurationCompact(row.activeSeconds)}</td>
    `;
    tbody.append(tr);
  });
  container.append(table);
}

function deriveBirdDayMetrics(detections, dayKey, bucketMinutes) {
  const dayStart = new Date(`${dayKey}T00:00:00`);
  const dayEnd = new Date(`${dayKey}T24:00:00`);
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketCount = Math.max(1, Math.floor((dayEnd - dayStart) / bucketMs));
  const perSpeciesPerBucket = new Map();
  const speciesDayIntervals = new Map();
  const speciesCounts = new Map();
  const speciesEbirdCodes = new Map();

  detections.forEach((detection) => {
    const interval = getDetectionInterval(detection);
    if (!interval) return;
    const clipped = clipInterval(interval, dayStart, dayEnd);
    if (!clipped) return;
    const species = getBirdLabel(detection);
    speciesCounts.set(species, (speciesCounts.get(species) || 0) + 1);
    if (!speciesEbirdCodes.has(species) && detection?.ebird_species_code) {
      speciesEbirdCodes.set(species, String(detection.ebird_species_code).trim());
    }
    if (!speciesDayIntervals.has(species)) speciesDayIntervals.set(species, []);
    speciesDayIntervals.get(species).push(clipped);
    if (!perSpeciesPerBucket.has(species)) perSpeciesPerBucket.set(species, new Map());
    const speciesBuckets = perSpeciesPerBucket.get(species);

    const firstBucket = Math.max(
      0,
      Math.floor((clipped.start.getTime() - dayStart.getTime()) / bucketMs)
    );
    const lastBucket = Math.min(
      bucketCount - 1,
      Math.floor((clipped.end.getTime() - 1 - dayStart.getTime()) / bucketMs)
    );
    for (let index = firstBucket; index <= lastBucket; index += 1) {
      const bucketStartMs = dayStart.getTime() + index * bucketMs;
      const bucketEndMs = bucketStartMs + bucketMs;
      const overlapStartMs = Math.max(clipped.start.getTime(), bucketStartMs);
      const overlapEndMs = Math.min(clipped.end.getTime(), bucketEndMs);
      if (overlapEndMs <= overlapStartMs) continue;
      if (!speciesBuckets.has(index)) speciesBuckets.set(index, []);
      speciesBuckets
        .get(index)
        .push({ start: new Date(overlapStartMs), end: new Date(overlapEndMs) });
    }
  });

  const dayTotals = [];
  speciesDayIntervals.forEach((intervals, species) => {
    dayTotals.push({
      species,
      count: speciesCounts.get(species) || 0,
      occupiedSeconds: totalMergedSeconds(intervals),
      ebirdSpeciesCode: speciesEbirdCodes.get(species) || ""
    });
  });

  dayTotals.sort((a, b) => {
    if (b.occupiedSeconds !== a.occupiedSeconds) {
      return b.occupiedSeconds - a.occupiedSeconds;
    }
    return b.count - a.count;
  });
  const species = dayTotals.map((row) => row.species);

  const buckets = [];
  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = new Date(dayStart.getTime() + index * bucketMs);
    const bucketEnd = new Date(bucketStart.getTime() + bucketMs);
    const fractions = {};
    species.forEach((name) => {
      const intervalBuckets = perSpeciesPerBucket.get(name);
      const intervals = intervalBuckets?.get(index) || [];
      fractions[name] = Math.min(1, totalMergedSeconds(intervals) / (bucketMs / 1000));
    });
    buckets.push({ bucketStart, bucketEnd, fractions });
  }

  return {
    species,
    dailyRows: dayTotals,
    buckets
  };
}

function deriveBirdSnapshotRows(detections, nowMs) {
  const windowEnd = new Date(nowMs);
  const windowStart = new Date(nowMs - 5 * 60 * 1000);
  const perSpecies = new Map();

  detections.forEach((detection) => {
    const interval = getDetectionInterval(detection);
    if (!interval) return;
    const clipped = clipInterval(interval, windowStart, windowEnd);
    if (!clipped) return;
    const species = getBirdLabel(detection);
    if (!perSpecies.has(species)) {
      perSpecies.set(species, {
        species,
        count: 0,
        intervals: [],
        latestMs: 0,
        ebirdSpeciesCode: ""
      });
    }
    const row = perSpecies.get(species);
    row.count += 1;
    row.intervals.push(clipped);
    row.latestMs = Math.max(row.latestMs, clipped.end.getTime());
    if (!row.ebirdSpeciesCode && detection?.ebird_species_code) {
      row.ebirdSpeciesCode = String(detection.ebird_species_code).trim();
    }
  });

  return [...perSpecies.values()]
    .map((row) => ({
      species: row.species,
      count: row.count,
      activeSeconds: totalMergedSeconds(row.intervals),
      latestMs: row.latestMs,
      ebirdSpeciesCode: row.ebirdSpeciesCode
    }))
    .sort((a, b) => {
      if (b.latestMs !== a.latestMs) {
        return b.latestMs - a.latestMs;
      }
      return b.count - a.count;
    });
}

function getDetectionInterval(detection) {
  const start = parseIsoLocal(detection.start_utc);
  if (!start) return null;
  const parsedEnd = parseIsoLocal(detection.end_utc);
  if (parsedEnd && parsedEnd > start) {
    return { start, end: parsedEnd };
  }
  const fallbackSeconds =
    Number(detection?.metadata?.window_seconds || 0) ||
    Number(detection.duration_seconds || 0) ||
    1;
  return {
    start,
    end: new Date(start.getTime() + Math.max(1, fallbackSeconds) * 1000)
  };
}

function getBirdLabel(detection) {
  const metadataCommon = detection?.metadata?.common_name;
  const metadataScientific = detection?.metadata?.scientific_name;
  if (metadataCommon && metadataScientific) {
    return `${toTitleLike(metadataCommon)} (${toScientificLike(metadataScientific)})`;
  }
  if (metadataCommon) return toTitleLike(metadataCommon);
  if (metadataScientific) return toScientificLike(metadataScientific);

  const raw = String(detection.label || "").trim();
  if (!raw) return "Unknown Bird";
  return formatBirdLabel(raw);
}

function clipInterval(interval, rangeStart, rangeEnd) {
  const startMs = Math.max(interval.start.getTime(), rangeStart.getTime());
  const endMs = Math.min(interval.end.getTime(), rangeEnd.getTime());
  if (endMs <= startMs) return null;
  return { start: new Date(startMs), end: new Date(endMs) };
}

function totalMergedSeconds(intervals) {
  if (!intervals.length) return 0;
  const sorted = intervals
    .map((interval) => [interval.start.getTime(), interval.end.getTime()])
    .sort((a, b) => a[0] - b[0]);
  let totalMs = 0;
  let currentStart = sorted[0][0];
  let currentEnd = sorted[0][1];
  for (let i = 1; i < sorted.length; i += 1) {
    const [nextStart, nextEnd] = sorted[i];
    if (nextStart <= currentEnd) {
      currentEnd = Math.max(currentEnd, nextEnd);
      continue;
    }
    totalMs += currentEnd - currentStart;
    currentStart = nextStart;
    currentEnd = nextEnd;
  }
  totalMs += currentEnd - currentStart;
  return totalMs / 1000;
}

function formatDurationCompact(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderBirdSparklineSvg(species) {
  const points = state.birdBuckets.map((bucket) => Number(bucket.fractions[species] || 0));
  const width = 120;
  const height = 24;
  const pad = 2;
  const max = Math.max(0.08, ...points);
  const path = points
    .map((value, index) => {
      const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
      const y = height - pad - (value / max) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = "var(--accent)";
  return `
    <svg class="bird-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.6" />
    </svg>
  `;
}

function renderSiteIndex(siteIds) {
  if (!elements.siteIndexList) return;
  elements.siteIndexList.innerHTML = "";
  if (!siteIds.length) {
    const empty = document.createElement("p");
    empty.className = "muted-note";
    empty.textContent = "No site namespaces found under /orecchio_sites.";
    elements.siteIndexList.append(empty);
    return;
  }
  const table = document.createElement("table");
  table.className = "birds-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Site</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  siteIds.forEach((siteId) => {
    const safeSite = encodeURIComponent(siteId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><a class="site-index-link" href="/${safeSite}/">${escapeHtml(siteId)}</a></td>
    `;
    tbody.append(tr);
  });
  elements.siteIndexList.append(table);
}


function parseRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length || parts[0].endsWith(".html")) {
    return { kind: "legacy-root", siteId: "" };
  }
  const siteId = decodeURIComponent(parts[0]);
  if (parts.length === 1) {
    return { kind: "site-dashboard", siteId };
  }
  if (parts.length === 2 && parts[1].toLowerCase() === "birds") {
    return { kind: "site-birds", siteId };
  }
  return { kind: "unsupported", siteId: "" };
}

function resolveRoutePath() {
  const params = new URLSearchParams(window.location.search);
  const encodedPath = params.get("p");
  if (!encodedPath) return window.location.pathname;
  try {
    const decoded = decodeURIComponent(encodedPath);
    return decoded || window.location.pathname;
  } catch (_error) {
    return window.location.pathname;
  }
}

function formatBirdLabel(raw) {
  const text = raw.replaceAll("__", "_").trim();
  if (!text.includes("_")) {
    return toTitleLike(text);
  }

  const [left, ...rest] = text.split("_");
  const right = rest.join("_").trim();
  const leftClean = left.trim();
  const rightClean = right.trim();
  if (!leftClean || !rightClean) {
    return toTitleLike(text.replaceAll("_", " "));
  }

  if (looksScientific(leftClean)) {
    return `${toTitleLike(rightClean)} (${toScientificLike(leftClean)})`;
  }
  if (looksScientific(rightClean)) {
    return `${toTitleLike(leftClean)} (${toScientificLike(rightClean)})`;
  }
  return `${toTitleLike(rightClean)} (${toScientificLike(leftClean)})`;
}

function looksScientific(value) {
  const words = value
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return false;
  return /^[A-Z][a-z-]+$/.test(words[0]) && /^[a-z-]+$/.test(words[1]);
}

function toScientificLike(value) {
  const words = String(value)
    .replaceAll("_", " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  return words
    .map((word, index) =>
      index === 0
        ? capitalizeWord(word.toLowerCase())
        : word.toLowerCase()
    )
    .join(" ");
}

function toTitleLike(value) {
  const smallWords = new Set(["and", "or", "the", "of", "in", "on", "at", "to", "for"]);
  const words = String(value)
    .replaceAll("_", " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return capitalizeWord(lower);
    })
    .join(" ");
}

function capitalizeWord(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}
