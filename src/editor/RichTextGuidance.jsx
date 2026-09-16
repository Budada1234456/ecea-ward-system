import React from "react";
import { getRichTextGuidance } from "./field-guidance.mjs";

export function RichTextGuidance({ fieldKey }) {
  const guidance = getRichTextGuidance(fieldKey);
  if (!guidance) return null;
  return (
    <div className="rich-field-guidance" aria-label="填写指引">
      {guidance.text.split("\n").map((line, index) => (
        <div key={`${fieldKey}-guidance-${index}`}>{line}</div>
      ))}
    </div>
  );
}

export function RichTextCounter({ fieldKey, value }) {
  const guidance = getRichTextGuidance(fieldKey);
  if (!guidance) return null;
  const source = String(value || "");
  const count = /<\/?[a-z][\s\S]*>/i.test(source)
    ? (
        new DOMParser().parseFromString(source, "text/html").body.textContent ||
        ""
      ).length
    : source.length;
  return (
    <div
      className={
        count > guidance.max
          ? "rich-editor-guidance-counter rich-editor-guidance-counter--over"
          : "rich-editor-guidance-counter"
      }
      aria-live="polite"
    >
      字数 {count}
      {guidance.max ? ` / ${guidance.max}` : ""}
      {guidance.note ? ` · ${guidance.note}` : ""}
    </div>
  );
}
