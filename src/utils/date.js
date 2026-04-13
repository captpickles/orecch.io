export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function eachDate(start, end) {
  const result = [];
  let current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setHours(0, 0, 0, 0);
  while (current <= endCopy) {
    result.push(new Date(current));
    current = addDays(current, 1);
  }
  return result;
}

export function parseIsoLocal(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const easternDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function getEasternDateKeyFromIso(isoValue) {
  const date = parseIsoLocal(isoValue);
  if (!date) return null;
  return easternDateFormatter.format(date);
}

export function getTodayKey() {
  return toDateKey(new Date());
}

export function formatDayLabel(key) {
  const date = new Date(`${key}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

export function clampDateRange(startKey, endKey, maxDays) {
  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  if (start > end) {
    return { startKey: endKey, endKey: startKey };
  }
  const diffDays = Math.floor((end - start) / 86400000) + 1;
  if (diffDays <= maxDays) {
    return { startKey, endKey };
  }
  const clampedStart = addDays(end, -(maxDays - 1));
  return { startKey: toDateKey(clampedStart), endKey };
}
