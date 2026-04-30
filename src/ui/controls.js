import { formatEventTypeLabel } from "../utils/labels.js";

export function renderEventTypeFilters(container, eventTypes, selected, onChange) {
  renderCheckboxFilters({
    container,
    values: eventTypes,
    selected,
    onChange,
    formatLabel: formatEventTypeLabel,
    emptyMessage: "No event types loaded yet."
  });
}

export function renderCheckboxFilters({
  container,
  values,
  selected,
  onChange,
  formatLabel = (value) => String(value || ""),
  emptyMessage = "No items loaded yet."
}) {
  container.innerHTML = "";
  if (!values.length) {
    container.textContent = emptyMessage;
    return;
  }
  values.forEach((value) => {
    const label = document.createElement("label");
    label.className = "chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.has(value);
    input.addEventListener("change", () => {
      if (input.checked) {
        selected.add(value);
      } else {
        selected.delete(value);
      }
      onChange();
    });
    const text = document.createElement("span");
    text.textContent = formatLabel(value);
    label.append(input, text);
    container.append(label);
  });
}
