import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { tableFields } from "../schema/table-fields.js";
import {
  createDefaultPerson,
  createDefaultUnit,
  normalizeEntityRecords,
} from "./data-contract.js";
import { reorderAndRenumber } from "../utils/reorder.js";
import { FieldControl } from "./StructuredTable.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

const CONFIG = {
  people: {
    label: "完成人",
    title: "主要完成人情况表",
    create: createDefaultPerson,
    Icon: UserRound,
  },
  units: {
    label: "完成单位",
    title: "主要完成单位情况表",
    create: createDefaultUnit,
    Icon: UsersRound,
  },
};

function isEmpty(value) {
  return value == null || String(value).trim() === "";
}

export function EntityEditor({
  entityType,
  value = [],
  onChange,
  number,
  title,
  renderCustomField,
  afterFields,
}) {
  const config = CONFIG[entityType];
  if (!config) throw new Error(`Unknown entity type: ${entityType}`);
  const fields = tableFields[entityType];
  const records = useMemo(
    () => normalizeEntityRecords(entityType, value),
    [entityType, value],
  );
  const [selectedId, setSelectedId] = useState(records[0]?.id || null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [touched, setTouched] = useState(() => new Set());
  const [pendingRemovalId, setPendingRemovalId] = useState(null);
  const [dragState, setDragState] = useState(null);
  const firstControlRef = useRef(null);
  const listRefs = useRef(new Map());
  const pendingFocus = useRef(null);
  const pointerDrag = useRef(null);

  useEffect(() => {
    if (!records.some((record) => record.id === selectedId)) {
      setSelectedId(records[0]?.id || null);
    }
  }, [records, selectedId]);

  useEffect(() => {
    if (pendingFocus.current === "field") {
      firstControlRef.current?.focus();
      pendingFocus.current = null;
    }
  }, [selectedId]);

  const selectedIndex = records.findIndex((record) => record.id === selectedId);
  const selected = selectedIndex >= 0 ? records[selectedIndex] : null;
  const update = (key, nextValue) =>
    onChange(
      records.map((record) =>
        record.id === selectedId ? { ...record, [key]: nextValue } : record,
      ),
    );
  const openDetails = (id) => {
    setSelectedId(id);
    setMobileDetailOpen(true);
    pendingFocus.current = "field";
  };
  const returnToList = (focusId = selectedId) => {
    setMobileDetailOpen(false);
    requestAnimationFrame(() => {
      const element = listRefs.current.get(focusId);
      element?.scrollIntoView({ block: "nearest", inline: "nearest" });
      element?.focus({ preventScroll: true });
    });
  };
  const add = () => {
    const next = config.create(records.length);
    onChange([...records, next]);
    setSelectedId(next.id);
    setMobileDetailOpen(true);
    pendingFocus.current = "field";
    setAnnouncement(`已新增第 ${records.length + 1} ${config.label}`);
  };
  const requestRemoval = (id) => setPendingRemovalId(id);
  const cancelRemoval = () => setPendingRemovalId(null);
  const confirmRemoval = () => {
    const removalIndex = records.findIndex(
      (record) => record.id === pendingRemovalId,
    );
    const removed = records[removalIndex];
    if (!removed) return cancelRemoval();
    const next = records.filter((record) => record.id !== pendingRemovalId);
    const neighbor = next[Math.min(removalIndex, next.length - 1)];
    onChange(next.map((record, index) => ({ ...record, rank: index + 1 })));
    setSelectedId(neighbor?.id || null);
    setMobileDetailOpen(false);
    setPendingRemovalId(null);
    if (neighbor) requestAnimationFrame(() => returnToList(neighbor.id));
    setAnnouncement(`${removed.name || config.label}已删除`);
  };
  const reorder = (fromIndex, toIndex) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= records.length ||
      toIndex >= records.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const moved = records[fromIndex];
    onChange(reorderAndRenumber(records, fromIndex, toIndex));
    setSelectedId(moved.id);
    setAnnouncement(`${moved.name || config.label}已移至第 ${toIndex + 1} 名`);
    requestAnimationFrame(() => listRefs.current.get(moved.id)?.focus());
  };
  const move = (offset) => reorder(selectedIndex, selectedIndex + offset);
  const moveRecord = (id, offset) => {
    const index = records.findIndex((record) => record.id === id);
    reorder(index, index + offset);
  };
  const startPointerDrag = (event, index) => {
    if (event.pointerType === "mouse") return;
    pointerDrag.current = { index, pointerId: event.pointerId };
    setDragState({ fromIndex: index, overIndex: index });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const updatePointerDrag = (event) => {
    const drag = pointerDrag.current;
    if (!drag) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-entity-index]");
    const overIndex = Number(target?.dataset.entityIndex);
    if (Number.isInteger(overIndex)) {
      setDragState({ fromIndex: drag.index, overIndex });
    }
  };
  const finishPointerDrag = (event) => {
    const drag = pointerDrag.current;
    pointerDrag.current = null;
    if (!drag) return setDragState(null);
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-entity-index]");
    const toIndex = Number(target?.dataset.entityIndex);
    if (Number.isInteger(toIndex)) reorder(drag.index, toIndex);
    setDragState(null);
  };
  const startMouseDrag = (event, index) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    setDragState({ fromIndex: index, overIndex: index });
  };
  const dropMouseDrag = (event, toIndex) => {
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(fromIndex)) reorder(fromIndex, toIndex);
    setDragState(null);
  };
  const markTouched = (key) =>
    setTouched((current) => new Set(current).add(`${selectedId}:${key}`));
  const Icon = config.Icon;

  return (
    <section
      className={`form-section entity-editor ${
        mobileDetailOpen ? "entity-editor--mobile-detail" : ""
      }`}
    >
      <header className="section-heading entity-editor__header">
        <div>
          {number != null && (
            <span className="section-index">
              {String(number).padStart(2, "0")}
            </span>
          )}
          <h2>{title || config.title}</h2>
        </div>
        <button className="secondary-button" type="button" onClick={add}>
          <Plus size={16} /> 新增{config.label}
        </button>
      </header>
      {records.length ? (
        <div className="entity-editor__layout">
          <nav
            className="entity-editor__list"
            aria-label={`${config.label}列表`}
          >
            {records.map((record, index) => (
              <div
                className={`entity-editor__list-item ${
                  dragState?.overIndex === index ? "is-drag-over" : ""
                }`}
                data-entity-index={index}
                key={record.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragState((current) =>
                    current ? { ...current, overIndex: index } : current,
                  );
                }}
                onDrop={(event) => dropMouseDrag(event, index)}
              >
                <button
                  className="entity-editor__drag"
                  type="button"
                  draggable
                  aria-label={`拖动排序${record.name || config.label}`}
                  title="拖动排序；Alt+上/下方向键可移动"
                  onDragStart={(event) => startMouseDrag(event, index)}
                  onDragEnd={() => setDragState(null)}
                  onPointerDown={(event) => startPointerDrag(event, index)}
                  onPointerMove={updatePointerDrag}
                  onPointerUp={finishPointerDrag}
                  onPointerCancel={() => {
                    pointerDrag.current = null;
                    setDragState(null);
                  }}
                  onKeyDown={(event) => {
                    if (
                      !event.altKey ||
                      !["ArrowUp", "ArrowDown"].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    reorder(index, index + (event.key === "ArrowUp" ? -1 : 1));
                  }}
                >
                  <GripVertical aria-hidden="true" size={17} />
                </button>
                <button
                  type="button"
                  className={`entity-editor__select ${
                    record.id === selectedId ? "active" : ""
                  }`}
                  aria-pressed={record.id === selectedId}
                  ref={(element) => {
                    if (element) listRefs.current.set(record.id, element);
                    else listRefs.current.delete(record.id);
                  }}
                  onClick={() => openDetails(record.id)}
                >
                  <b>{index + 1}</b>
                  <span>
                    {record.name || `第 ${index + 1} ${config.label}`}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveRecord(record.id, -1)}
                  aria-label={`上移${record.name || config.label}`}
                  title="上移"
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  type="button"
                  disabled={index === records.length - 1}
                  onClick={() => moveRecord(record.id, 1)}
                  aria-label={`下移${record.name || config.label}`}
                  title="下移"
                >
                  <ArrowDown size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => requestRemoval(record.id)}
                  aria-label={`删除${record.name || config.label}`}
                  title={`删除${config.label}`}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </nav>
          {selected && (
            <article className="entity-editor__details">
              <button
                className="entity-editor__back"
                type="button"
                onClick={() => returnToList()}
              >
                <ArrowLeft size={17} /> 返回{config.label}列表
              </button>
              <div className="entity-editor__details-head">
                <span>
                  <Icon size={18} />
                  <b>
                    {selected.name || `第 ${selectedIndex + 1} ${config.label}`}
                  </b>
                  <small>
                    {entityType === "units" && selectedIndex === 0
                      ? "牵头单位"
                      : `排名 ${selectedIndex + 1}`}
                  </small>
                </span>
                <div className="entity-editor__actions">
                  <button
                    type="button"
                    disabled={selectedIndex === 0}
                    onClick={() => move(-1)}
                    aria-label={`上移${selected.name || config.label}`}
                    title="上移"
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    type="button"
                    disabled={selectedIndex === records.length - 1}
                    onClick={() => move(1)}
                    aria-label={`下移${selected.name || config.label}`}
                    title="下移"
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => requestRemoval(selected.id)}
                    aria-label={`删除${selected.name || config.label}`}
                    title={`删除${config.label}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              <div className="entity-editor__fields">
                {fields.map((field, fieldIndex) => {
                  const custom = renderCustomField?.({
                    field,
                    record: selected,
                    index: selectedIndex,
                    update,
                  });
                  if (custom) {
                    return (
                      <div
                        className="entity-editor__custom-field"
                        key={field.key}
                      >
                        {custom}
                      </div>
                    );
                  }
                  const invalid =
                    field.required &&
                    touched.has(`${selectedId}:${field.key}`) &&
                    isEmpty(selected[field.key]);
                  return (
                    <label
                      className={invalid ? "is-invalid" : ""}
                      key={field.key}
                    >
                      <span>
                        {field.required && <i aria-hidden="true">*</i>}
                        {field.label}
                      </span>
                      <FieldControl
                        field={field}
                        value={selected[field.key] ?? field.defaultValue ?? ""}
                        invalid={invalid}
                        inputRef={
                          fieldIndex === 0 ? firstControlRef : undefined
                        }
                        onBlur={() => markTouched(field.key)}
                        onChange={(nextValue) => update(field.key, nextValue)}
                      />
                      {field.hint && (
                        <small className="entity-editor__hint">
                          {field.hint}
                        </small>
                      )}
                      {invalid && <small>请填写{field.label}</small>}
                    </label>
                  );
                })}
                {entityType === "units" && (
                  <p className="entity-editor__accuracy-note">
                    注：务必确保以上相关信息完整无误。
                  </p>
                )}
              </div>
            </article>
          )}
        </div>
      ) : (
        <div className="empty-record entity-editor__empty">
          <Icon size={28} />
          <span>暂无主要{config.label}</span>
          <button className="secondary-button" type="button" onClick={add}>
            <Plus size={15} /> 新增{config.label}
          </button>
        </div>
      )}
      {afterFields?.({ records, selected, selectedIndex, update })}
      <p
        className="entity-editor__announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      <ConfirmDialog
        open={Boolean(pendingRemovalId)}
        message={`确定删除${config.label}“${
          records.find((record) => record.id === pendingRemovalId)?.name ||
          "未命名"
        }”吗？删除后无法撤销。`}
        onCancel={cancelRemoval}
        onConfirm={confirmRemoval}
      />
    </section>
  );
}
