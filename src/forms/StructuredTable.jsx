import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { tableFields } from "../schema/table-fields.js";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { createDefaultTableRecord } from "./data-contract.js";

function valueFor(record, field) {
  if (record?.[field.key] !== undefined) return record[field.key];
  const legacyKey = field.legacyKeys?.find(
    (key) => record?.[key] !== undefined,
  );
  return legacyKey ? record[legacyKey] : (field.defaultValue ?? "");
}

function isEmpty(value) {
  return value == null || String(value).trim() === "";
}

function FieldControl({
  field,
  value,
  onChange,
  onBlur,
  inputRef,
  invalid = false,
}) {
  const commonProps = {
    "aria-invalid": invalid || undefined,
    "aria-label": field.label,
    "aria-description": field.hint || undefined,
    disabled: field.disabled,
    onBlur,
    ref: inputRef,
    required: field.required,
    value: value ?? "",
  };

  if (Array.isArray(field.options)) {
    return (
      <select
        {...commonProps}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择</option>
        {field.options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  const constrainedValueIsValid =
    value == null ||
    value === "" ||
    (field.type === "number" && Number.isFinite(Number(value))) ||
    (field.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) ||
    (field.type === "month" && /^\d{4}-\d{2}$/.test(String(value)));
  const type =
    ["number", "date", "month"].includes(field.type) && !constrainedValueIsValid
      ? "text"
      : field.type || "text";

  const props = {
    ...commonProps,
    type,
    inputMode: field.inputMode,
    maxLength: field.maxLength,
    placeholder: field.example || undefined,
    readOnly: field.readOnly,
    onChange: (event) => onChange(event.target.value),
  };
  return field.multiline ? (
    <textarea {...props} rows={2} />
  ) : (
    <input {...props} />
  );
}

export function StructuredTable({
  group,
  fields: customFields,
  value = [],
  onChange,
  title,
  addLabel = "添加记录",
  emptyLabel = "暂无记录",
  className = "",
  showIndex = false,
  confirmRemoval = false,
}) {
  const fields = customFields || tableFields[group] || [];
  const records = Array.isArray(value) ? value : [];
  const [touched, setTouched] = useState(() => new Set());
  const [pendingRemovalIndex, setPendingRemovalIndex] = useState(null);
  const controlRefs = useRef(new Map());
  const pendingFocus = useRef(null);
  const recordKey = (record, index) => record.id || `row-${index}`;
  const controlKey = (record, index, fieldKey) =>
    `${recordKey(record, index)}:${fieldKey}`;
  const columns = useMemo(
    () =>
      `${showIndex ? "56px " : ""}${fields
        .map((field) => field.width || "minmax(120px, 1fr)")
        .join(" ")} 48px`,
    [fields, showIndex],
  );
  const minWidth = useMemo(
    () =>
      Math.max(
        760,
        fields.reduce((total, field) => total + (field.minWidth || 130), 48) +
          (showIndex ? 56 : 0),
      ),
    [fields, showIndex],
  );

  useEffect(() => {
    if (!pendingFocus.current) return;
    controlRefs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [records.length]);

  const addRecord = () => {
    const rowIndex = records.length;
    const record = group
      ? createDefaultTableRecord(group, rowIndex)
      : createDefaultRecordForFields(fields, rowIndex);
    pendingFocus.current = controlKey(record, rowIndex, fields[0]?.key);
    onChange([...records, record]);
  };
  const updateRecord = (rowIndex, field, nextValue) =>
    onChange(
      records.map((record, index) => {
        if (index !== rowIndex) return record;
        const next = { ...record, [field.key]: nextValue };
        for (const legacyKey of field.legacyKeys || []) {
          next[legacyKey] = undefined;
        }
        return next;
      }),
    );
  const removeRecord = (rowIndex) => {
    const removedKey = recordKey(records[rowIndex], rowIndex);
    const next = records.filter((_, index) => index !== rowIndex);
    if (next.length) {
      const nextIndex = Math.min(rowIndex, next.length - 1);
      pendingFocus.current = controlKey(
        next[nextIndex],
        nextIndex,
        fields[0]?.key,
      );
    }
    setTouched(
      (current) =>
        new Set(
          [...current].filter((key) => !key.startsWith(`${removedKey}:`)),
        ),
    );
    onChange(next);
  };
  const markTouched = (record, rowIndex, fieldKey) =>
    setTouched((current) =>
      new Set(current).add(controlKey(record, rowIndex, fieldKey)),
    );

  return (
    <section className={`structured-table ${className}`.trim()}>
      {(title || addLabel) && (
        <header className="structured-table__header">
          {title && <h3>{title}</h3>}
          <button
            className="secondary-button"
            type="button"
            onClick={addRecord}
          >
            <Plus size={16} />
            {addLabel}
          </button>
        </header>
      )}
      {records.length === 0 ? (
        <p className="structured-table__empty">{emptyLabel}</p>
      ) : (
        <div
          className="structured-table__scroll"
          role="region"
          aria-label={title || "结构化数据表"}
          tabIndex={0}
        >
          <div className="structured-table__grid" style={{ minWidth }}>
            <div
              className="structured-table__head"
              style={{ gridTemplateColumns: columns }}
              role="row"
            >
              {showIndex && (
                <span
                  className="structured-table__sticky-start"
                  role="columnheader"
                >
                  序号
                </span>
              )}
              {fields.map((field, index) => (
                <span
                  role="columnheader"
                  className={
                    !showIndex && index === 0
                      ? "structured-table__sticky-start"
                      : undefined
                  }
                  key={field.key}
                >
                  {field.required && <i aria-hidden="true">*</i>}
                  {field.label}
                </span>
              ))}
              <span
                className="structured-table__sticky-end"
                role="columnheader"
              >
                操作
              </span>
            </div>
            {records.map((record, rowIndex) => (
              <div
                className="structured-table__row"
                style={{ gridTemplateColumns: columns }}
                role="row"
                key={record.id || rowIndex}
              >
                {showIndex && (
                  <span className="structured-table__index structured-table__sticky-start">
                    {rowIndex + 1}
                  </span>
                )}
                {fields.map((field, fieldIndex) => {
                  const value = valueFor(record, field);
                  const touchKey = controlKey(record, rowIndex, field.key);
                  const invalid =
                    field.required && touched.has(touchKey) && isEmpty(value);
                  return (
                    <label
                      className={`structured-table__cell${invalid ? " is-invalid" : ""}${!showIndex && fieldIndex === 0 ? " structured-table__sticky-start" : ""}`}
                      key={field.key}
                    >
                      <span>{field.label}</span>
                      <FieldControl
                        field={field}
                        value={value}
                        invalid={invalid}
                        inputRef={(element) => {
                          const key = controlKey(record, rowIndex, field.key);
                          if (element) controlRefs.current.set(key, element);
                          else controlRefs.current.delete(key);
                        }}
                        onBlur={() => markTouched(record, rowIndex, field.key)}
                        onChange={(nextValue) =>
                          updateRecord(rowIndex, field, nextValue)
                        }
                      />
                      {field.hint && (
                        <small className="structured-table__hint">
                          {field.hint}
                        </small>
                      )}
                      {invalid && <small>请填写{field.label}</small>}
                    </label>
                  );
                })}
                <div className="structured-table__actions structured-table__sticky-end">
                  <button
                    className="icon-button icon-button--small"
                    type="button"
                    aria-label={`删除第${rowIndex + 1}条记录`}
                    title="删除"
                    onClick={() =>
                      confirmRemoval
                        ? setPendingRemovalIndex(rowIndex)
                        : removeRecord(rowIndex)
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingRemovalIndex != null}
        message={`确定删除知识产权“${
          records[pendingRemovalIndex]?.name || "未命名"
        }”吗？删除后无法撤销。`}
        onCancel={() => setPendingRemovalIndex(null)}
        onConfirm={() => {
          removeRecord(pendingRemovalIndex);
          setPendingRemovalIndex(null);
        }}
      />
    </section>
  );
}

function createDefaultRecordForFields(fields, index = 0) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `record-${Date.now()}-${index}`,
    ...Object.fromEntries(
      fields.map((field) => [field.key, field.defaultValue ?? ""]),
    ),
  };
}

export { FieldControl };
