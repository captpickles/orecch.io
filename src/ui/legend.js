import { createTypeColorScale } from "../charts/colors.js";

export function renderTypeLegend(container, eventTypes, selectedEventTypes) {
  container.innerHTML = "";
  const active = eventTypes.filter((type) => selectedEventTypes.has(type));
  if (!active.length) {
    return;
  }
  const color = createTypeColorScale(eventTypes);
  active.forEach((type) => {
    const item = document.createElement("span");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = color(type);

    const text = document.createElement("span");
    text.textContent = type;

    item.append(swatch, text);
    container.append(item);
  });
}
