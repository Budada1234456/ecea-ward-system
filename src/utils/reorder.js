function isValidIndex(index, length) {
  return Number.isInteger(index) && index >= 0 && index < length;
}

export function renumberItems(items, rankKey = "rank") {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    ...item,
    [rankKey]: index + 1,
  }));
}

export function moveItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items)) return [];
  if (
    !isValidIndex(fromIndex, items.length) ||
    !isValidIndex(toIndex, items.length)
  ) {
    return [...items];
  }
  if (fromIndex === toIndex) return [...items];

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveUp(items, index) {
  return moveItem(items, index, index - 1);
}

export function moveDown(items, index) {
  return moveItem(items, index, index + 1);
}

export function canMoveUp(index) {
  return Number.isInteger(index) && index > 0;
}

export function canMoveDown(index, length) {
  return (
    Number.isInteger(index) &&
    Number.isInteger(length) &&
    length > 0 &&
    index >= 0 &&
    index < length - 1
  );
}

export function reorderAndRenumber(
  items,
  fromIndex,
  toIndex,
  rankKey = "rank",
) {
  return renumberItems(moveItem(items, fromIndex, toIndex), rankKey);
}
