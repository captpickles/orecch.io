export function renderEventTypeFilters(container, eventTypes, selected, onChange) {
  container.innerHTML = "";
  if (!eventTypes.length) {
    container.textContent = "No event types loaded yet.";
    return;
  }
  eventTypes.forEach((type) => {
    const label = document.createElement("label");
    label.className = "chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.has(type);
    input.addEventListener("change", () => {
      if (input.checked) {
        selected.add(type);
      } else {
        selected.delete(type);
      }
      onChange();
    });
    const text = document.createElement("span");
    text.textContent = type;
    label.append(input, text);
    container.append(label);
  });
}
