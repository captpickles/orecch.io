import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { formatDayLabel } from "../utils/date.js";
import { createTypeColorScale } from "./colors.js";
import { renderChartPlaceholder } from "./placeholder.js";
import { formatEventTypeLabel } from "../utils/labels.js";

export function renderSummaryChart({
  container,
  rows,
  eventTypes,
  selectedEventTypes,
  selectedDayKey,
  onSelectDay
}) {
  container.innerHTML = "";
  if (!rows.length || !eventTypes.length) {
    renderChartPlaceholder(container, "No summary data for this date range.");
    return;
  }

  const width = container.clientWidth || 900;
  const height = Math.max(280, Math.floor(width * 0.42));
  const margin = { top: 22, right: 12, bottom: 42, left: 68 };

  const activeTypes = eventTypes.filter((t) => selectedEventTypes.has(t));
  if (!activeTypes.length) {
    renderChartPlaceholder(container, "Select at least one event type.");
    return;
  }

  const stackKeys = [...activeTypes].sort((a, b) => {
    const totalA = d3.sum(rows, (row) => row.durations[a] || 0);
    const totalB = d3.sum(rows, (row) => row.durations[b] || 0);
    return totalB - totalA;
  });

  const data = rows.map((row) => {
    const entry = { dateKey: row.dateKey };
    stackKeys.forEach((type) => {
      entry[type] = row.durations[type] || 0;
    });
    return entry;
  });

  const stack = d3.stack().keys(stackKeys);
  const series = stack(data);
  const maxY = d3.max(series, (s) => d3.max(s, (d) => d[1])) || 1;

  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.dateKey))
    .range([margin.left, width - margin.right])
    .padding(0.16);

  const y = d3
    .scaleLinear()
    .domain([0, maxY])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const color = createTypeColorScale(eventTypes);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${width} ${height}`);

  const tooltip = getTooltip();
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3.axisBottom(x).tickFormat((key) => formatDayLabel(key)).tickSizeOuter(0)
    );

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .ticks(5)
        .tickSizeOuter(0)
        .tickFormat((seconds) => formatDurationShort(seconds))
    );

  svg
    .append("g")
    .selectAll("g")
    .data(series)
    .join("g")
    .attr("fill", (d) => color(d.key))
    .selectAll("rect")
    .data((d) => d.map((item) => ({ ...item, type: d.key })))
    .join("rect")
    .attr("x", (d) => x(d.data.dateKey))
    .attr("y", (d) => y(d[1]))
    .attr("height", (d) => Math.max(0, y(d[0]) - y(d[1])))
    .attr("width", x.bandwidth())
    .attr("stroke", (d) => (d.data.dateKey === selectedDayKey ? "#091d42" : "none"))
    .attr("stroke-width", (d) => (d.data.dateKey === selectedDayKey ? 1.4 : 0))
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      const dayTotal = activeTypes.reduce(
        (acc, type) => acc + (d.data[type] || 0),
        0
      );
      tooltip.innerHTML = `${d.data.dateKey}<br>${formatEventTypeLabel(
        d.type
      )}: ${formatDuration(d.data[d.type])}<br>Total: ${formatDuration(dayTotal)}`;
      tooltip.classList.add("visible");
      moveTooltip(tooltip, event);
    })
    .on("mousemove", (event) => moveTooltip(tooltip, event))
    .on("mouseleave", () => tooltip.classList.remove("visible"))
    .on("click", (_, d) => onSelectDay(d.data.dateKey));

  container.append(svg.node());
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

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatDurationShort(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (secs === 0) return `${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (total >= 60) {
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    if (secs === 0) return `${minutes}m`;
    return `${minutes}m ${secs}s`;
  }
  return `${total}s`;
}
