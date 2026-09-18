import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  X,
} from "lucide-react";
import {
  DISCIPLINE_STATUS,
  normalizeDisciplineSelection,
} from "./data-contract.js";
import {
  getDisciplineChildren,
  getDisciplineOptions,
  getDisciplinePath,
  isDisciplineSelectable,
} from "./discipline-options.js";
import { moveItem } from "../utils/reorder.js";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

const MAX_SELECTIONS = 3;
const BROWSE_PAGE_SIZE = 50;

function disciplineMeta(item) {
  return [item.code, `第 ${item.level} 级`].filter(Boolean).join(" · ");
}

export function DisciplineSelector({
  value = [],
  onChange,
  disciplines = [],
  maxSelections = MAX_SELECTIONS,
  label = "学科分类名称",
  hierarchical = true,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [parentCode, setParentCode] = useState(null);
  const [browseLimit, setBrowseLimit] = useState(BROWSE_PAGE_SIZE);
  const [announcement, setAnnouncement] = useState("");
  const [pendingRemovalIndex, setPendingRemovalIndex] = useState(null);
  const [dragState, setDragState] = useState(null);
  const selectorRef = useRef(null);
  const itemRefs = useRef([]);
  const pendingFocusIndex = useRef(null);
  const pointerDrag = useRef(null);
  const resultsId = useId();
  const selection = normalizeDisciplineSelection(value);
  const selectedCodes = new Set(
    selection.map((item) => item.code).filter(Boolean),
  );
  const byCode = useMemo(
    () => new Map(disciplines.map((item) => [item.code, item])),
    [disciplines],
  );
  const childCounts = useMemo(() => {
    const counts = new Map();
    disciplines.forEach((item) => {
      if (item.parentCode) {
        counts.set(item.parentCode, (counts.get(item.parentCode) || 0) + 1);
      }
    });
    return counts;
  }, [disciplines]);
  const isSearching = Boolean(query.trim());
  const allResults = useMemo(
    () =>
      isSearching
        ? getDisciplineOptions(disciplines, query)
        : getDisciplineChildren(disciplines, parentCode),
    [disciplines, isSearching, parentCode, query],
  );
  const results = isSearching ? allResults : allResults.slice(0, browseLimit);
  const browsePath = useMemo(
    () => getDisciplinePath(disciplines, parentCode, byCode),
    [byCode, disciplines, parentCode],
  );

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!selectorRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const index = pendingFocusIndex.current;
    if (index == null) return;
    itemRefs.current[index]?.focus();
    pendingFocusIndex.current = null;
  }, [selection]);

  const hasChildren = (item) => Boolean(childCounts.get(item.code));
  const pathLabel = (item) =>
    hierarchical
      ? getDisciplinePath(disciplines, item.code, byCode)
          .map((node) => `${node.name}（${node.code}）`)
          .join(" / ")
      : item.name;
  const selectedPathLabel = (item) => {
    if (!hierarchical) return item.name;
    const nodes = (item.path || [])
      .map((code) => byCode.get(code))
      .filter(Boolean);
    return nodes.length
      ? nodes.map((node) => `${node.name}（${node.code}）`).join(" / ")
      : item.name;
  };
  const browseChildren = (item) => {
    setParentCode(item.code);
    setQuery("");
    setBrowseLimit(BROWSE_PAGE_SIZE);
  };
  const browseTo = (code) => {
    setParentCode(code);
    setBrowseLimit(BROWSE_PAGE_SIZE);
  };
  const selectDiscipline = (item) => {
    if (
      !isDisciplineSelectable(item) ||
      selection.length >= maxSelections ||
      selectedCodes.has(item.code)
    ) {
      return;
    }
    const path = getDisciplinePath(disciplines, item.code, byCode).map(
      (node) => node.code,
    );
    onChange([
      ...selection,
      {
        id: `discipline-${item.code}`,
        code: item.code,
        name: item.name,
        level: item.level,
        parentCode: item.parentCode || null,
        path,
        status: DISCIPLINE_STATUS.CONFIRMED,
      },
    ]);
    setQuery("");
    setOpen(false);
    setAnnouncement(
      `${pathLabel(item)}已添加为第 ${selection.length + 1} 项学科`,
    );
  };
  const remove = (index) => {
    const removed = selection[index];
    const next = selection.filter((_, itemIndex) => itemIndex !== index);
    onChange(next);
    if (next.length)
      pendingFocusIndex.current = Math.min(index, next.length - 1);
    setAnnouncement(`${removed.name}已删除`);
    setPendingRemovalIndex(null);
  };
  const move = (fromIndex, toIndex) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= selection.length ||
      toIndex >= selection.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    onChange(moveItem(selection, fromIndex, toIndex));
    pendingFocusIndex.current = toIndex;
    setAnnouncement(`${selection[fromIndex].name}已移至第 ${toIndex + 1} 项`);
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
      ?.closest("[data-discipline-index]");
    const overIndex = Number(target?.dataset.disciplineIndex);
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
      ?.closest("[data-discipline-index]");
    const toIndex = Number(target?.dataset.disciplineIndex);
    if (Number.isInteger(toIndex)) move(drag.index, toIndex);
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
    if (Number.isInteger(fromIndex)) move(fromIndex, toIndex);
    setDragState(null);
  };

  return (
    <div className="discipline-selector" ref={selectorRef}>
      <label>
        <span>{label}</span>
        <input
          role="combobox"
          aria-label="检索学科"
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-expanded={open}
          value={query}
          placeholder={hierarchical ? "输入学科名称或代码" : "输入学科分类名称"}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </label>
      {open && (
        <div
          className="discipline-selector__results"
          id={resultsId}
          role="listbox"
        >
          {!isSearching && (
            <div className="discipline-selector__browse">
              <p>
                {hierarchical
                  ? "可选择一级、二级或三级学科，每个已选项保存一条完整路径。"
                  : "请从以下学科分类中选择，最多选择3项。"}
              </p>
              {hierarchical && (
                <nav aria-label="学科层级路径">
                  <button type="button" onClick={() => browseTo(null)}>
                    全部一级学科
                  </button>
                  {browsePath.map((item, index) => (
                    <React.Fragment key={item.code}>
                      <ChevronRight size={13} aria-hidden="true" />
                      <button
                        type="button"
                        aria-current={
                          index === browsePath.length - 1 ? "page" : undefined
                        }
                        onClick={() => browseTo(item.code)}
                      >
                        {item.name}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>
              )}
            </div>
          )}
          <div className="discipline-selector__options">
            {results.length ? (
              results.map((item) => {
                const expandable = hierarchical && hasChildren(item);
                const selectable = isDisciplineSelectable(item);
                return (
                  <div className="discipline-selector__option" key={item.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedCodes.has(item.code)}
                      disabled={
                        !selectable ||
                        selectedCodes.has(item.code) ||
                        selection.length >= maxSelections
                      }
                      title={
                        expandable
                          ? "选择此学科；也可展开下级学科"
                          : "选择此学科路径"
                      }
                      onClick={() => selectDiscipline(item)}
                    >
                      <span>{item.name}</span>
                      {hierarchical && (
                        <small>
                          {disciplineMeta(item)}
                          {isSearching && <em>{pathLabel(item)}</em>}
                        </small>
                      )}
                    </button>
                    {expandable && (
                      <button
                        className="discipline-selector__expand"
                        type="button"
                        aria-label={`展开${item.name}的下级学科`}
                        title="展开下级学科"
                        onClick={() => browseChildren(item)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <p>没有匹配的学科</p>
            )}
          </div>
          {!isSearching && results.length < allResults.length && (
            <button
              className="discipline-selector__more"
              type="button"
              onClick={() =>
                setBrowseLimit((current) => current + BROWSE_PAGE_SIZE)
              }
            >
              显示更多（已显示 {results.length} / {allResults.length}）
            </button>
          )}
        </div>
      )}
      <ol className="discipline-selector__selection" aria-label="已选学科">
        {selection.map((item, index) => (
          <li
            className={dragState?.overIndex === index ? "is-drag-over" : ""}
            key={item.id}
            data-discipline-index={index}
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
              className="discipline-selector__drag"
              type="button"
              draggable
              aria-label={`拖动排序${item.name}`}
              title="拖动排序；Alt+上/下方向键可移动"
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
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
                move(index, index + (event.key === "ArrowUp" ? -1 : 1));
              }}
            >
              <GripVertical aria-hidden="true" size={17} />
            </button>
            <b>{index + 1}</b>
            <span>
              {selectedPathLabel(item)}
              {item.status === DISCIPLINE_STATUS.PENDING && (
                <small>待确认</small>
              )}
            </span>
            <button
              type="button"
              aria-label={`上移${item.name}`}
              title="上移"
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              aria-label={`下移${item.name}`}
              title="下移"
              disabled={index === selection.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDown size={16} />
            </button>
            <button
              type="button"
              aria-label={`删除${item.name}`}
              title="删除"
              onClick={() => setPendingRemovalIndex(index)}
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ol>
      {selection.length < maxSelections && (
        <button type="button" onClick={() => setOpen(true)}>
          <Plus size={16} /> 添加学科
          <ChevronDown size={16} />
        </button>
      )}
      <p
        className="discipline-selector__announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      <ConfirmDialog
        open={pendingRemovalIndex != null}
        message={`确定删除学科“${
          selection[pendingRemovalIndex]?.name || "未命名"
        }”吗？删除后无法撤销。`}
        onCancel={() => setPendingRemovalIndex(null)}
        onConfirm={() => remove(pendingRemovalIndex)}
      />
    </div>
  );
}

export { MAX_SELECTIONS };
