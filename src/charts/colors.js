import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const palette = [
  "#cf9e5f",
  "#d46a53",
  "#739a55",
  "#6e80cf",
  "#b76bb3",
  "#5ea8a0",
  "#c6b04b",
  "#9a7b6b"
];

export function createTypeColorScale(eventTypes) {
  const domain = [...new Set(eventTypes)].sort();
  return d3.scaleOrdinal(domain, palette);
}
