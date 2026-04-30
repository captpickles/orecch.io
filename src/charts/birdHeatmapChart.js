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

  const width = container.clientWidth || 900;
  const rowHeight = Math.max(20, Math.floor(380 / Math.max(1, activeSpecies.length)));
  const height = Math.max(320, 110 + rowHeight * activeSpecies.length);
  const margin = { top: 18, right: 16, bottom: 44, left: 280 };

  const xKeys = buckets.map((_, index) => index);
  const x = d3
    .scaleBand()
    .domain(xKeys)
    .range([margin.left, width - margin.right])
    .paddingInner(0.01);

  const y = d3
    .scaleBand()
    .domain(activeSpecies)
    .range([margin.top, height - margin.bottom])
    .paddingInner(0.1);

  const maxObserved =
    d3.max(
      buckets.flatMap((bucket) =>
        activeSpecies.map((name) => Number(bucket.fractions[name] || 0))
      )
    ) || 0.01;
  const color = d3.scaleSequential(d3.interpolateYlOrBr).domain([0, maxObserved]);

  const svg = d3.create("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const tooltip = getTooltip();

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(xKeys.filter((index) => index % 8 === 0))
        .tickFormat((index) => formatAxisTime(buckets[index].bucketStart))
        .tickSizeOuter(0)
    )
    .call((g) => {
      g.select(".domain").attr("stroke-opacity", 0.3);
      g.selectAll("line").attr("stroke-opacity", 0.25);
      g.selectAll("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.9em");
    });

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3.axisLeft(y).tickSize(0)
    )
    .call((g) => g.select(".domain").remove());

  const cellData = [];
  activeSpecies.forEach((name) => {
    xKeys.forEach((index) => {
      cellData.push({
        species: name,
        index,
        fraction: Number(buckets[index].fractions[name] || 0),
        start: buckets[index].bucketStart,
        end: buckets[index].bucketEnd
      });
    });
  });

  svg
    .append("g")
    .selectAll("rect")
    .data(cellData)
    .join("rect")
    .attr("x", (d) => x(d.index))
    .attr("y", (d) => y(d.species))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", (d) => (d.fraction > 0 ? color(d.fraction) : "var(--chip-bg)"))
    .on("mouseenter", (event, d) => {
      tooltip.innerHTML = `${d.species}<br>${timeFormatter.format(
        d.start
      )} - ${timeFormatter.format(d.end)}<br>Occupancy: ${percentFormatter.format(d.fraction)}`;
      tooltip.classList.add("visible");
      moveTooltip(tooltip, event);
    })
    .on("mousemove", (event) => moveTooltip(tooltip, event))
    .on("mouseleave", () => tooltip.classList.remove("visible"));

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 6)
    .style("font-size", "11px")
    .style("fill", "var(--muted)")
    .text(`${bucketMinutes}-minute occupancy heatmap`);

  container.append(svg.node());
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
