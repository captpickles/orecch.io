import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { parseIsoLocal } from "../utils/date.js";
import { createTypeColorScale } from "./colors.js";
import { renderChartPlaceholder } from "./placeholder.js";
import { formatEventTypeLabel } from "../utils/labels.js";

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
  selectedDayKey,
  daylightStartHour = 8,
  daylightEndHour = 20,
  showNowMarker = false,
  nowMs = Date.now()
}) {
  container.innerHTML = "";

  const filtered = events.filter((evt) => selectedEventTypes.has(evt.event_type));
  if (!filtered.length) {
    renderChartPlaceholder(
      container,
      `No events for ${selectedDayKey} with current filters.`
    );
    return;
  }

  const width = container.clientWidth || 900;
  const height = Math.max(280, Math.floor(width * 0.42));
  const margin = { top: 16, right: 16, bottom: 42, left: 80 };
  const dayStart = new Date(`${selectedDayKey}T00:00:00`);
  const dayEnd = new Date(`${selectedDayKey}T23:59:59.999`);

  const parsed = filtered
    .map((evt) => ({
      ...evt,
      startDate: parseIsoLocal(evt.start_utc)
    }))
    .filter(
      (evt) => evt.startDate && evt.startDate >= dayStart && evt.startDate <= dayEnd
    );
  if (!parsed.length) {
    renderChartPlaceholder(container, `No valid timestamps for ${selectedDayKey}.`);
    return;
  }

  const mergedMarks = mergeIntoDurationMarks(parsed);
  const drawOrderMarks = [...mergedMarks].sort(
    (a, b) => (b.totalDurationSeconds || 0) - (a.totalDurationSeconds || 0)
  );

  const x = d3
    .scaleTime()
    .domain([dayStart, dayEnd])
    .clamp(true)
    .range([margin.left, width - margin.right]);
  const daylightWindow = getDaylightWindow(selectedDayKey, daylightStartHour, daylightEndHour);

  const activeTypes = eventTypes.filter((t) => selectedEventTypes.has(t));
  const y = d3
    .scalePoint()
    .domain(activeTypes)
    .range([margin.top, height - margin.bottom])
    .padding(0.5);

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
    .append("rect")
    .attr("x", x(daylightWindow.start))
    .attr("y", margin.top)
    .attr("width", Math.max(0, x(daylightWindow.end) - x(daylightWindow.start)))
    .attr("height", height - margin.top - margin.bottom)
    .attr("fill", "#8f7448")
    .attr("fill-opacity", 0.12);

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickFormat((value) => formatEventTypeLabel(value)));

  svg
    .append("g")
    .attr("class", "timeline-row-guides")
    .selectAll("line")
    .data(activeTypes)
    .join("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", (type) => y(type))
    .attr("y2", (type) => y(type))
    .attr("stroke", "#5b4d3b")
    .attr("stroke-opacity", 0.68)
    .attr("stroke-dasharray", "3,4");

  svg
    .append("g")
    .selectAll("line")
    .data(drawOrderMarks)
    .join("line")
    .attr("x1", (d) => x(d.startDate))
    .attr("x2", (d) => Math.max(x(d.endDate), x(d.startDate) + 1))
    .attr("y1", (d) => y(d.event_type))
    .attr("y2", (d) => y(d.event_type))
    .attr("stroke", (d) => color(d.event_type))
    .attr("stroke-width", (d) => (d.eventCount > 1 ? 9 : 6))
    .attr("stroke-linecap", "round")
    .attr("stroke-opacity", 0.93)
    .style("filter", "drop-shadow(0 0 2px rgba(210, 170, 120, 0.32))")
    .on("mouseenter", (event, d) => {
      tooltip.innerHTML = `${formatEventTypeLabel(d.event_type)}<br>${formatTime(
        d.startDate
      )} - ${formatTime(d.endDate)}<br>${
        d.eventCount
      } event${d.eventCount === 1 ? "" : "s"}<br>${Math.round(
        d.totalDurationSeconds || 0
      )} sec ${d.eventCount > 1 ? "combined" : ""}`.trim();
      tooltip.classList.add("visible");
      moveTooltip(tooltip, event);
    })
    .on("mousemove", (event) => moveTooltip(tooltip, event))
    .on("mouseleave", () => tooltip.classList.remove("visible"));

  const hoverLine = svg
    .append("line")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "#c9a979")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0.62)
    .attr("stroke-dasharray", "3,4")
    .style("display", "none")
    .style("pointer-events", "none");

  const hoverLabel = svg
    .append("text")
    .attr("x", 0)
    .attr("y", margin.top + 10)
    .style("font-size", "10px")
    .style("fill", "#c9a979")
    .style("opacity", "0.9")
    .style("display", "none")
    .style("pointer-events", "none");

  svg
    .on("mousemove", (event) => {
      const [mx, my] = d3.pointer(event, svg.node());
      if (
        mx < margin.left ||
        mx > width - margin.right ||
        my < margin.top ||
        my > height - margin.bottom
      ) {
        hoverLine.style("display", "none");
        hoverLabel.style("display", "none");
        return;
      }
      const hoveredTime = x.invert(mx);
      hoverLine
        .attr("x1", mx)
        .attr("x2", mx)
        .style("display", null);
      hoverLabel
        .attr("x", Math.min(mx + 6, width - margin.right - 42))
        .text(formatEasternTime(hoveredTime))
        .style("display", null);
    })
    .on("mouseleave", () => {
      hoverLine.style("display", "none");
      hoverLabel.style("display", "none");
    });

  if (showNowMarker) {
    const now = new Date(nowMs);
    if (now >= dayStart && now <= dayEnd) {
      const nowX = x(now);
      svg
        .append("line")
        .attr("x1", nowX)
        .attr("x2", nowX)
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#d7b68a")
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.5)
        .attr("stroke-dasharray", "3,5");

      svg
        .append("text")
        .attr("x", nowX + 5)
        .attr("y", margin.top + 10)
        .style("font-size", "10px")
        .style("fill", "#d7b68a")
        .style("opacity", "0.72")
        .text("now");
    }
  }

  container.append(svg.node());
}

function formatTime(date) {
  return `${formatEasternTime(date)} ET`;
}

function formatEasternTime(date) {
  return easternTimeFormatter.format(date);
}

function mergeIntoDurationMarks(events) {
  const groups = new Map();
  events.forEach((event) => {
    const minuteBucket = Math.floor(event.startDate.getTime() / 60000);
    const key = `${event.event_type}::${minuteBucket}`;
    const endDate = inferEndDate(event);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        event_type: event.event_type,
        startDate: event.startDate,
        endDate,
        totalDurationSeconds: Number(event.duration_seconds || 0),
        eventCount: 1
      });
      return;
    }
    if (event.startDate < existing.startDate) {
      existing.startDate = event.startDate;
    }
    if (endDate > existing.endDate) {
      existing.endDate = endDate;
    }
    existing.totalDurationSeconds += Number(event.duration_seconds || 0);
    existing.eventCount += 1;
  });
  return [...groups.values()];
}

function inferEndDate(event) {
  const parsedEnd = parseIsoLocal(event.end_utc);
  if (parsedEnd) return parsedEnd;
  const fallbackSeconds = Number(event.duration_seconds || 0);
  return new Date(event.startDate.getTime() + fallbackSeconds * 1000);
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

function getDaylightWindow(selectedDayKey, startHour, endHour) {
  const safeStart = clampHour(startHour);
  const safeEnd = clampHour(endHour);
  const [first, second] = safeStart <= safeEnd ? [safeStart, safeEnd] : [safeEnd, safeStart];
  return {
    start: new Date(`${selectedDayKey}T${String(first).padStart(2, "0")}:00:00`),
    end: new Date(`${selectedDayKey}T${String(second).padStart(2, "0")}:00:00`)
  };
}

function clampHour(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(23, Math.floor(number)));
}
