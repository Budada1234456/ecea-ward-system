const SEARCH_RESULT_LIMIT = 50;

function matchesDisciplineQuery(item, normalizedQuery) {
  return `${item.code || ""} ${item.name || ""}`
    .toLowerCase()
    .includes(normalizedQuery);
}

export function getDisciplineOptions(
  disciplines = [],
  query = "",
  browseLevel = 1,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return disciplines.filter(
      (item) => Number(item.level) === Number(browseLevel),
    );
  }

  return disciplines
    .filter((item) => matchesDisciplineQuery(item, normalizedQuery))
    .slice(0, SEARCH_RESULT_LIMIT);
}

export function getDisciplineChildren(disciplines = [], parentCode = null) {
  return disciplines.filter((item) =>
    parentCode == null
      ? Number(item.level) === 1
      : item.parentCode === parentCode,
  );
}

export function getDisciplinePath(disciplines = [], code = null) {
  if (!code) return [];
  const byCode = new Map(disciplines.map((item) => [item.code, item]));
  const item = byCode.get(code);
  if (!item) return [];
  return (Array.isArray(item.path) ? item.path : [code])
    .map((pathCode) => byCode.get(pathCode))
    .filter(Boolean);
}

export { SEARCH_RESULT_LIMIT };
