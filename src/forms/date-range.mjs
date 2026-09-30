export function parseDateRange(value) {
  const source = String(value || "").trim();
  const normalized = source.replace(/年|\//g, "-").replace(/月(?=\d)/g, "-").replace(/[月日]/g, "");
  const match = normalized.match(/^(\d{4}-\d{2}(?:-\d{2})?)?\s*(?:至|到|~|～|—|–|\s+-\s+)\s*(\d{4}-\d{2}(?:-\d{2})?)?$/);
  if (!source) return { start: "", end: "", type: "month", legacy: "" };
  if (!match) return { start: "", end: "", type: "month", legacy: source };
  const start = match[1] || "";
  const end = match[2] || "";
  const type = [start, end].some((date) => date.length > 7) ? "date" : "month";
  if (type === "date" && [start, end].some((date) => date && date.length !== 10)) {
    return { start: "", end: "", type: "month", legacy: source };
  }
  return { start, end, type, legacy: "" };
}

export function formatDateRange(start, end) {
  return start || end ? `${start} 至 ${end}` : "";
}
