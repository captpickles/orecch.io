import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { parseIsoLocal } from "../utils/date.js";
import { createTypeColorScale } from "./colors.js";

const easternTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

export function renderTimelineChart({
  container,
  events,
  eventTypes,
  selectedEventTypes,
  selectedDayKey
}) {
  container.innerHTML = "";

  const filtered = events.filter((evt) => selectedEventTypes.has(evt.event_type));
  if (!filtered.length) {
    container.textContent = `No events for ${selectedDayKey} with current filters.`;
    return;
  }

  const width = container.clientWidth || 900;
  const height = Math.max(280, Math.floor(width * 0.42));
  const margin = { top: 16, right: 16, bottom: 42, left: 80 };

  const parsed = filtered
    .map((evt) => ({
      ...evt,
      startDate: parseIsoLocal(evt.start_utc)
    }))
    .filter((evt) => evt.startDate);

  const mergedPoints = mergeOverlappingEvents(parsed);

  const x = d3
    .scaleTime()
    .domain([
      new Date(`${selectedDayKey}T00:00:00`),
      new Date(`${selectedDayKey}T23:59:59`)
    ])
    .range([margin.left, width - margin.right]);

  const activeTypes = eventTypes.filter((t) => selectedEventTypes.has(t));
  const y = d3
    .scalePoint()
    .domain(activeTypes)
    .range([margin.top, height - margin.bottom])
    .padding(0.5);

  const durationExtent = d3.extent(mergedPoints, (d) => d.totalDurationSeconds || 0);
  const radius = d3
    .scaleSqrt()
    .domain([durationExtent[0] || 0, durationExtent[1] || 1])
    .range([3, 12]);

  const color = createTypeColorScale(eventTypes);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const tooltip = getTooltip();

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(width < 650 ? 5 : 8)
        .tickFormat((value) => formatEasternTime(value))
    );

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  svg
    .append("g")
    .selectAll("circle")
    .data(mergedPoints)
    .join("circle")
    .attr("cx", (d) => x(d.startDate))
    .attr("cy", (d) => y(d.event_type))
    .attr("r", (d) => radius(d.totalDurationSeconds || 0))
    .attr("fill", (d) => color(d.event_type))
    .attr("fill-opacity", 0.75)
    .attr("stroke", "#173564")
    .attr("stroke-width", 0.7)
    .on("mouseenter", (event, d) => {
      tooltip.innerHTML = `${d.event_type}<br>${formatTime(d.startDate)}<br>${
        d.eventCount
      } event${d.eventCount === 1 ? "" : "s"}<br>${Math.round(
        d.totalDurationSeconds || 0
      )} sec total`;
      tooltip.classList.add("visible");
      moveTooltip(tooltip, event);
    })
    .on("mousemove", (event) => moveTooltip(tooltip, event))
    .on("mouseleave", () => tooltip.classList.remove("visible"));

  container.append(svg.node());
}

function formatTime(date) {
  return `${formatEasternTime(date)} ET`;
}

function formatEasternTime(date) {
  return easternTimeFormatter.format(date);
}

function mergeOverlappingEvents(events) {
  const groups = new Map();
  events.forEach((event) => {
    const minuteBucket = Math.floor(event.startDate.getTime() / 60000);
    const key = `${event.event_type}::${minuteBucket}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        event_type: event.event_type,
        startDate: new Date(minuteBucket * 60000),
        totalDurationSeconds: Number(event.duration_seconds || 0),
        eventCount: 1
      });
      return;
    }
    existing.totalDurationSeconds += Number(event.duration_seconds || 0);
    existing.eventCount += 1;
  });
  return [...groups.values()];
}

function getTooltip() {
  let node = document.querySelector(".chart-tooltip");
  if (!node) {
    node = document.createElement("div");
    node.className = "chart-tooltip";
    document.body.append(node);
  }
  return node;
}

function moveTooltip(node, event) {
  node.style.left = `${event.clientX + 12}px`;
  node.style.top = `${event.clientY + 12}px`;
}
