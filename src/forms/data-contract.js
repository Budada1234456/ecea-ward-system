import {
  FIELD_DEFAULTS,
  FIELD_GROUPS,
  createDefaultRecord,
  tableFields,
} from "../schema/table-fields.js";

export const DISCIPLINE_STATUS = {
  CONFIRMED: "confirmed",
  PENDING: "pending",
};

const LEGACY_DISCIPLINE_LIMIT = 2;

const createStableId = (prefix, index = 0) => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${index}`;
};

const createLegacyId = (prefix, index) => `${prefix}-legacy-${index + 1}`;

const cloneValue = (value) => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    );
  }
  return value;
};

export function createDefaultPerson(index = 0) {
  return {
    id: createStableId("person", index),
    ...createDefaultRecord("people"),
    rank: index + 1,
  };
}

export function createDefaultUnit(index = 0) {
  return {
    id: createStableId("unit", index),
    ...createDefaultRecord("units"),
    rank: index + 1,
  };
}

export function normalizePersonRecord(value, index = 0) {
  const source = typeof value === "string" ? { name: value } : value || {};
  return {
    ...createDefaultRecord("people"),
    ...source,
    id: source.id || createLegacyId("person", index),
    rank: Number.isFinite(Number(source.rank))
      ? Number(source.rank)
      : index + 1,
  };
}

export function normalizeUnitRecord(value, index = 0) {
  const source = typeof value === "string" ? { name: value } : value || {};
  return {
    ...createDefaultRecord("units"),
    ...source,
    id: source.id || createLegacyId("unit", index),
    rank: Number.isFinite(Number(source.rank))
      ? Number(source.rank)
      : index + 1,
  };
}

export function normalizeEntityRecords(group, value) {
  const source = Array.isArray(value) ? value : [];
  const normalize =
    group === "people"
      ? normalizePersonRecord
      : group === "units"
        ? normalizeUnitRecord
        : null;
  if (!normalize) throw new Error(`Unknown entity group: ${group}`);

  const prefix = group === "people" ? "person" : "unit";
  const seenIds = new Set();
  return source.map((item, index) => {
    const record = { ...normalize(item, index), rank: index + 1 };
    const baseId = record.id || createLegacyId(prefix, index);
    let id = baseId;
    let duplicateNumber = 1;
    while (seenIds.has(id)) {
      id = `${baseId}-${duplicateNumber}`;
      duplicateNumber += 1;
    }
    seenIds.add(id);
    return { ...record, id };
  });
}

export function normalizeDisciplineSelection(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source
    .slice(0, 3)
    .map((item, index) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name
          ? {
              id: createLegacyId("discipline", index),
              code: null,
              name,
              level: null,
              parentCode: null,
              path: [],
              status: DISCIPLINE_STATUS.PENDING,
            }
          : null;
      }
      if (!item || typeof item !== "object") return null;
      const code = item.code || null;
      return {
        id:
          item.id ||
          (code ? `discipline-${code}` : createLegacyId("discipline", index)),
        code,
        name: String(item.name || "").trim(),
        level: item.level ?? null,
        parentCode: item.parentCode || null,
        path: Array.isArray(item.path) ? [...item.path] : code ? [code] : [],
        status:
          item.status === DISCIPLINE_STATUS.CONFIRMED && code
            ? DISCIPLINE_STATUS.CONFIRMED
            : DISCIPLINE_STATUS.PENDING,
      };
    })
    .filter(Boolean)
    .filter((item) => item.name);
}

export function derivePrimaryDiscipline(selection) {
  const primary = normalizeDisciplineSelection(selection)[0];
  return primary
    ? {
        id: primary.id,
        code: primary.code,
        name: primary.name,
        level: primary.level,
        parentCode: primary.parentCode,
        path: [...primary.path],
        status: primary.status,
      }
    : null;
}

export function createDefaultTableRecord(group, index = 0) {
  if (group === "people") return createDefaultPerson(index);
  if (group === "units") return createDefaultUnit(index);
  if (group === "economicSummary") return createDefaultRecord(group);
  return {
    id: createStableId(group, index),
    ...createDefaultRecord(group),
  };
}

export function normalizeTableRecord(group, value, index = 0) {
  if (group === "people") return normalizePersonRecord(value, index);
  if (group === "units") return normalizeUnitRecord(value, index);

  const defaults = FIELD_DEFAULTS[group];
  if (!defaults) throw new Error(`Unknown field group: ${group}`);
  const source = value && typeof value === "object" ? value : {};
  const normalized = { ...defaults, ...source };
  if (group !== "economicSummary") {
    normalized.id = source.id || createLegacyId(group, index);
  }
  for (const field of tableFields[group]) {
    const legacyKey = field.legacyKeys?.find(
      (key) => source[key] !== undefined,
    );
    const sourceKey = source[field.key] !== undefined ? field.key : legacyKey;
    normalized[field.key] = sourceKey ? source[sourceKey] : defaults[field.key];
  }
  return normalized;
}

function normalizeGroup(data, group) {
  const value = data[group];
  if (group === "economicSummary") {
    return normalizeTableRecord(group, value);
  }
  if (!Array.isArray(value)) return [];
  if (group === "people" || group === "units") {
    return normalizeEntityRecords(group, value);
  }
  const prefix =
    group === "people" ? "person" : group === "units" ? "unit" : group;
  const seenIds = new Set();
  return value.map((item, index) => {
    const normalizedRecord = normalizeTableRecord(group, item, index);
    const record = normalizedRecord;
    let id = record.id;
    let duplicateNumber = 1;
    while (seenIds.has(id)) {
      id = `${createLegacyId(prefix, index)}-${duplicateNumber}`;
      duplicateNumber += 1;
    }
    seenIds.add(id);
    return { ...record, id };
  });
}

export function normalizeApplicationData(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = { ...source };

  for (const group of FIELD_GROUPS) {
    normalized[group] = normalizeGroup(source, group);
  }

  normalized.disciplines = normalizeDisciplineSelection(source.disciplines);
  if (normalized.disciplines.length) {
    normalized.disciplines[0] = derivePrimaryDiscipline(normalized.disciplines);
  }
  return normalized;
}

export function createDefaultApplicationData() {
  return normalizeApplicationData({
    disciplines: [],
    people: [],
    units: [],
  });
}

export { LEGACY_DISCIPLINE_LIMIT, cloneValue };
