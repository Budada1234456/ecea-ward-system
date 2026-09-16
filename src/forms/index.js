export { DisciplineSelector } from "./DisciplineSelector.jsx";
export { EntityEditor } from "./EntityEditor.jsx";
export { StructuredTable } from "./StructuredTable.jsx";
export {
  DISCIPLINE_DATASET_META,
  disciplines,
  validateDisciplineRecords,
} from "../data/disciplines.js";
export {
  DISCIPLINE_STATUS,
  createDefaultApplicationData,
  createDefaultPerson,
  createDefaultTableRecord,
  createDefaultUnit,
  derivePrimaryDiscipline,
  normalizeApplicationData,
  normalizeDisciplineSelection,
  normalizePersonRecord,
  normalizeTableRecord,
  normalizeUnitRecord,
} from "./data-contract.js";
