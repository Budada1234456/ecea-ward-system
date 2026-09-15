const SOURCE_OPTIONS = [
  ["A", ["国家计划"]],
  ["B", ["部委计划"]],
  ["C", ["省、市、自治区计划", "省市自治区计划"]],
  ["D", ["基金资助"]],
  ["E", ["企业"]],
  ["F", ["国际合作"]],
  ["G", ["自选"]],
  ["H", ["其它", "其他"]],
];

function compactForMatching(value) {
  return String(value || "")
    .replace(/\r|\f/g, "\n")
    .replace(/[ \t\n]+/g, "")
    .replace(/[，,]/g, "、")
    .replace(/[.．]/g, ".");
}

function sourceWindow(text) {
  const compact = compactForMatching(text);
  const marker = compact.indexOf("项目来源");
  if (marker < 0) return "";
  const planMarker = compact.search(/具体计划、基金|[（(]\d+[）)]/);
  const end = planMarker > marker ? planMarker : marker + 300;
  return compact.slice(Math.max(0, marker - 180), end);
}

function extractSources(text) {
  const section = sourceWindow(text);
  if (!section) return [];

  const selected = [];
  const hasPrintedBoxes = /[☑✓✔√■●□]/u.test(section);
  for (const [key, labels] of SOURCE_OPTIONS) {
    const name = labels.find((label) => section.includes(label));
    if (!name) continue;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const checked = new RegExp(
      `[☑✓✔√■●勾选](?:${key}[.、]?)?${escapedName}`,
      "u",
    ).test(section);
    if (checked) selected.push(key);
  }
  if (hasPrintedBoxes) return selected;

  const found = [];
  for (const [key, labels] of SOURCE_OPTIONS) {
    const name = labels.find((label) => section.includes(label));
    if (!name) continue;
    const nameIndex = section.indexOf(name);
    const prefix = section.slice(Math.max(0, nameIndex - 8), nameIndex);
    found.push({
      key,
      hasMarker: new RegExp(`${key}[.、]?$`, "u").test(prefix),
    });
  }

  const intactMarkers = found.filter((item) => item.hasMarker).length;
  if (found.length === SOURCE_OPTIONS.length && intactMarkers >= 5) {
    return found.filter((item) => !item.hasMarker).map((item) => item.key);
  }
  return selected;
}

function normalizePlanItem(value, index) {
  let item = String(value || "")
    .replace(/\r|\f/g, "\n")
    .replace(/具\s*体\s*计\s*划\s*[、,，]?\s*基\s*金\s*[|｜]?/gu, "")
    .replace(/名\s*称\s*和\s*编\s*号\s*[|｜]?/gu, "")
    .replace(/^\s*[（(]\s*\d+\s*[）)]\s*/u, "")
    .trim();

  const lines = item
    .split("\n")
    .map((line) => line.trim().replace(/^[、，]\s*/u, ""))
    .filter(Boolean);
  item = lines.reduce((joined, line) => {
    if (!joined) return line;
    if (/[-‐‑—/]$/u.test(joined)) return joined + line;
    const needsSpace =
      /[A-Za-z0-9)]$/u.test(joined) && /^[A-Za-z(]/u.test(line);
    return joined + (needsSpace ? " " : "") + line;
  }, "");

  item = item
    .replace(
      /(?<=[\u3400-\u9fff\d，。；：、》《（）])[ \t]+(?=[\u3400-\u9fff\d])/gu,
      "",
    )
    .replace(/\s+([，。；：、）》])/gu, "$1")
    .replace(/([《（])\s+/gu, "$1")
    .replace(/[（(]\s*(\d+)\s*[）)]/gu, "（$1）")
    .replace(/[（(]\s*(计划|项目)\s*编号\s*[:：,，]\s*/gu, "（$1编号：")
    .replace(/（((?:计划|项目)编号：[^（）\n]{1,120})[)》]/gu, "（$1）")
    .replace(/\s*[:：]\s*$/u, "；")
    .replace(/\s+/g, " ")
    .trim();

  const numberLabelIndex = Math.max(
    item.lastIndexOf("（计划编号："),
    item.lastIndexOf("（项目编号："),
  );
  if (numberLabelIndex >= 0 && !item.slice(numberLabelIndex).includes("）")) {
    item = `${item.replace(/[；;。.]+$/u, "")}）；`;
  }

  return item ? `（${index}）${item}` : "";
}

function extractPlans(text) {
  const raw = String(text || "").replace(/\r|\f/g, "\n");
  const sourceIndex = compactForMatching(raw).indexOf("项目来源");
  const startMatch = raw.match(/[（(]\s*1\s*[）)]/u);
  if (!startMatch || sourceIndex < 0) return "";

  const start = startMatch.index;
  const afterStart = raw.slice(start);
  const endMatch = afterStart.match(/项\s*目\s*起\s*止\s*时\s*间/u);
  const section = endMatch
    ? afterStart.slice(0, endMatch.index)
    : afterStart.slice(0, 6000);
  const markers = [...section.matchAll(/[（(]\s*(\d{1,2})\s*[）)]/gu)];
  if (!markers.length) return "";

  return markers
    .map((marker, markerIndex) => {
      const next = markers[markerIndex + 1];
      const item = section.slice(
        marker.index,
        next ? next.index : section.length,
      );
      return normalizePlanItem(item, Number(marker[1]));
    })
    .filter(Boolean)
    .join("\n");
}

export function extractProjectSourceFields(text) {
  const sources = extractSources(text);
  const plans = extractPlans(text);
  return {
    ...(sources.length ? { sources } : {}),
    ...(plans ? { plans } : {}),
  };
}
