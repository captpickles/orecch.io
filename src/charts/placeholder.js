export function renderChartPlaceholder(container, message, tone = "neutral") {
  container.innerHTML = "";
  const div = document.createElement("div");
  div.className =
    tone === "error" ? "chart-placeholder error" : "chart-placeholder";
  div.textContent = message;
  container.append(div);
}
