import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderChartPlaceholder } from "./placeholder.js";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit"
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0
});

export function renderBirdHeatmapChart({
  container,
  buckets,
  species,
  selectedSpecies,
  bucketMinutes = 15,
  selectedDayKey
}) {
  container.innerHTML = "";

  const activeSpecies = species.filter((name) => selectedSpecies.has(name));
  if (!buckets.length || !activeSpecies.length) {
    renderChartPlaceholder(
      container,
      `No bird occupancy data for ${selectedDayKey} with current filters.`
    );
    return;
  }

  const width = container.clientWidth || 980;
  const rowHeight = 22;
  const height = Math.max(300, 88 + rowHeight * activeSpecies.length);
  const margin = { top: 18, right: 18, bottom: 42, left: 280 };

  const x = d3
    .scaleLinear()
    .domain([0, Math.max(1, buckets.length - 1)])
    .range([margin.left, width - margin.right]);

  const yRow = d3
    .scaleBand()
    .domain(activeSpecies)
    .range([margin.top, height - margin.bottom])
    .paddingInner(0.25);

  const rowInnerPad = 2;
  const yLocal = d3
    .scaleLinear()
    .domain([0, 1])
    .range([rowHeight - rowInnerPad, rowInnerPad]);

  const svg = d3.create("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const tooltip = getTooltip();

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(buildTickIndexes(buckets.length, 16))
        .tickFormat((index) => formatAxisTime(buckets[index].bucketStart))
        .tickSizeOuter(0)
    )
    .call((g) => {
      g.select(".domain").attr("stroke-opacity", 0.3);
      g.selectAll("line").attr("stroke-opacity", 0.2);
      g.selectAll("text").attr("dy", "0.9em");
    });

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(yRow)
        .tickSize(0)
        .tickFormat((name) => truncateLabel(toCommonBirdName(name), 30))
    )
    .call((g) => {
      g.select(".domain").remove();
      g.selectAll("text").style("font-size", "11px");
    });

  // Vertical reference guides every 2 hours.
  const guides = buildTickIndexes(buckets.length, 16);
  svg
    .append("g")
    .selectAll("line")
    .data(guides)
    .join("line")
    .attr("x1", (index) => x(index))
    .attr("x2", (index) => x(index))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "var(--tick)")
    .attr("stroke-opacity", 0.12)
    .attr("shape-rendering", "crispEdges");

  const line = d3
    .line()
    .x((d) => x(d.index))
    .y((d) => d.y)
    .curve(d3.curveMonotoneX);
  const area = d3
    .area()
    .x((d) => x(d.index))
    .y0((d) => d.rowBottom)
    .y1((d) => d.y)
    .curve(d3.curveMonotoneX);

  const rowGroup = svg.append("g");

  activeSpecies.forEach((name) => {
    const rowTop = yRow(name);
    const rowBottom = rowTop + yRow.bandwidth();
    const rowMid = (rowTop + rowBottom) / 2;

    const rowValues = buckets.map((bucket) => Number(bucket.fractions[name] || 0));
    const rowMax = Math.max(0.01, ...rowValues);
    const yLocalRow = yLocal.copy().domain([0, rowMax]);

    const rowPoints = buckets.map((bucket, index) => {
      const fraction = Number(bucket.fractions[name] || 0);
      return {
        index,
        fraction,
        y: rowTop + yLocalRow(fraction),
        rowBottom: rowBottom - 1,
        bucketStart: bucket.bucketStart,
        bucketEnd: bucket.bucketEnd
      };
    });

    rowGroup
      .append("path")
      .datum(rowPoints)
      .attr("fill", "var(--accent)")
      .attr("fill-opacity", 0.12)
      .attr("d", area);

    rowGroup
      .append("path")
      .datum(rowPoints)
      .attr("fill", "none")
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 1.9)
      .attr("stroke-opacity", 0.9)
      .attr("d", line);

    rowGroup
      .append("rect")
      .attr("x", margin.left)
      .attr("y", rowTop)
      .attr("width", width - margin.left - margin.right)
      .attr("height", yRow.bandwidth())
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event, svg.node());
        const idx = Math.max(
          0,
          Math.min(buckets.length - 1, Math.round(x.invert(mx)))
        );
        const point = rowPoints[idx];
        tooltip.innerHTML = `${toCommonBirdName(name)}<br>${timeFormatter.format(
          point.bucketStart
        )} - ${timeFormatter.format(point.bucketEnd)}<br>Occupancy: ${percentFormatter.format(
          point.fraction
        )}`;
        tooltip.classList.add("visible");
        moveTooltip(tooltip, event);
      })
      .on("mouseleave", () => tooltip.classList.remove("visible"));
  });

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 6)
    .style("font-size", "11px")
    .style("fill", "var(--muted)")
    .text(`${bucketMinutes}-minute occupancy sparkline matrix`);

  container.append(svg.node());
}

function buildTickIndexes(bucketCount, everyN) {
  const indexes = [];
  for (let i = 0; i < bucketCount; i += 1) {
    if (i % everyN === 0) indexes.push(i);
  }
  if (!indexes.length) indexes.push(0);
  return indexes;
}

function formatAxisTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function toCommonBirdName(label) {
  const raw = String(label || "").trim();
  const match = raw.match(/^(.+)\s+\((.+)\)$/);
  if (!match) return raw;
  return match[1].trim();
}

function truncateLabel(value, maxLen) {
  const text = String(value || "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}
