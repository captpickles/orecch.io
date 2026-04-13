import { config as appConfig } from "./config.js";
import { createRepository } from "./data/repository.js";
import { renderSummaryChart } from "./charts/summaryChart.js";
import { renderTimelineChart } from "./charts/timelineChart.js";
import { renderEventTypeFilters } from "./ui/controls.js";
import {
  clampDateRange,
  addDays,
  getTodayKey,
  toDateKey,
  parseIsoLocal
} from "./utils/date.js";

const elements = {
  startDate: document.querySelector("#start-date"),
  endDate: document.querySelector("#end-date"),
  eventTypeFilters: document.querySelector("#event-type-filters"),
  summaryChart: document.querySelector("#summary-chart"),
  timelineChart: document.querySelector("#timeline-chart"),
  status: document.querySelector("#status"),
  selectedDayLabel: document.querySelector("#selected-day-label")
};

const state = {
  repository: null,
  startKey: "",
  endKey: "",
  selectedDayKey: "",
  summaryRows: [],
  eventTypes: [],
  selectedEventTypes: new Set(),
  dayEvents: [],
  unsubscribeLive: null,
  pollTimer: null
};

init();

async function init() {
  const today = new Date();
  state.endKey = toDateKey(today);
  state.startKey = toDateKey(addDays(today, -(appConfig.lookbackDays - 1)));
  state.selectedDayKey = state.endKey;

  elements.startDate.value = state.startKey;
  elements.endDate.value = state.endKey;

  wireControls();
  await reloadAll();
  window.addEventListener("resize", debounce(renderCharts, 120));
}

function wireControls() {
  elements.startDate.addEventListener("change", async () => {
    state.startKey = elements.startDate.value || state.startKey;
    const clamped = clampDateRange(state.startKey, state.endKey, 31);
    state.startKey = clamped.startKey;
    state.endKey = clamped.endKey;
    syncDateInputs();
    await reloadSummary();
  });

  elements.endDate.addEventListener("change", async () => {
    state.endKey = elements.endDate.value || state.endKey;
    const clamped = clampDateRange(state.startKey, state.endKey, 31);
    state.startKey = clamped.startKey;
    state.endKey = clamped.endKey;
    syncDateInputs();
    await reloadSummary();
  });

}

async function reloadAll() {
  cleanupRealtime();
  state.repository = createRepository(appConfig);
  await reloadSummary();
  await loadSelectedDayEvents();
}

async function reloadSummary() {
  try {
    setStatus("Loading daily summaries...");
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
    setStatus("Summary loaded.");
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load summary: ${error.message}`, true);
  }
}

async function loadSelectedDayEvents() {
  cleanupRealtime();
  try {
    setStatus(`Loading events for ${state.selectedDayKey}...`);
    const events = await state.repository.getDayEvents(state.selectedDayKey);
    state.dayEvents = events;
    reconcileSelectedDaySummaryWithEvents();
    mergeEventTypes(uniqueTypes(events));
    renderFilters();
    renderCharts();
    setupRealtimeIfAvailable();
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load day events: ${error.message}`, true);
  }
}

function setupRealtimeIfAvailable() {
  const isToday = state.selectedDayKey === getTodayKey();
  if (!isToday) {
    setStatus(`Showing ${state.selectedDayKey}.`);
    return;
  }

  if (state.repository.mode === "firebase-sdk") {
    state.unsubscribeLive = state.repository.subscribeDayEvents(
      state.selectedDayKey,
      (events) => {
        state.dayEvents = events.sort((a, b) =>
          new Date(a.start_utc) - new Date(b.start_utc)
        );
        reconcileSelectedDaySummaryWithEvents();
        mergeEventTypes(uniqueTypes(state.dayEvents));
        renderFilters();
        renderCharts();
        setStatus("Live RTDB updates active for today.");
      }
    );
    setStatus("Listening for live updates on today's events...");
    return;
  }

  state.pollTimer = setInterval(async () => {
    try {
      state.dayEvents = await state.repository.getDayEvents(state.selectedDayKey);
      reconcileSelectedDaySummaryWithEvents();
      renderCharts();
    } catch (err) {
      console.error("poll error", err);
    }
  }, appConfig.pollMs);
  setStatus(`Polling today's events every ${Math.round(appConfig.pollMs / 1000)}s.`);
}

function cleanupRealtime() {
  if (state.unsubscribeLive) {
    state.unsubscribeLive();
    state.unsubscribeLive = null;
  }
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function renderFilters() {
  renderEventTypeFilters(
    elements.eventTypeFilters,
    state.eventTypes,
    state.selectedEventTypes,
    renderCharts
  );
}

function renderCharts() {
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
    selectedDayKey: state.selectedDayKey
  });
  elements.selectedDayLabel.textContent = `Selected day: ${state.selectedDayKey}`;
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
  elements.startDate.value = state.startKey;
  elements.endDate.value = state.endKey;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#bd2b00" : "";
}

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}
