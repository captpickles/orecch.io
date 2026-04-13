export function formatEventTypeLabel(value) {
  return String(value || "").replaceAll("_", " ");
}
