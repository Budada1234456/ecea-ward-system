import React, { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  open,
  title = "确认删除",
  message,
  confirmLabel = "确认删除",
  onCancel,
  onConfirm,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const frame = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previousFocus?.focus?.();
    };
  }, [open]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancelRef.current();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [
      ...dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="confirmation-layer"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={handleKeyDown}
      >
        <h3 id={titleId}>{title}</h3>
        <p id={messageId}>{message}</p>
        <div className="confirmation-dialog__actions">
          <button ref={cancelRef} type="button" onClick={onCancel}>
            取消
          </button>
          <button className="danger-button" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
