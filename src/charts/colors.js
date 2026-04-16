import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const palette = [
  "#7f8fbf",
  "#b5715d",
  "#7a925f",
  "#9b7c54",
  "#8e74a8",
  "#5f8f91",
  "#b19a62",
  "#8a6f61"
];

export function createTypeColorScale(eventTypes) {
  const domain = [...new Set(eventTypes)].sort();
  return d3.scaleOrdinal(domain, palette);
}
