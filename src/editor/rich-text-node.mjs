import sanitizeHtml from "sanitize-html";
import {
  RICH_TEXT_ALLOWED_ATTRIBUTES,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_FIELD_KEYS,
  sanitizeRichTextAttributes,
} from "./rich-text-policy.mjs";

const NODE_SANITIZE_OPTIONS = {
  allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
  allowedAttributes: Object.fromEntries(
    Object.entries(RICH_TEXT_ALLOWED_ATTRIBUTES).map(([tag, attributes]) => [
      tag,
      [...attributes],
    ]),
  ),
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  enforceHtmlBoundary: true,
  transformTags: {
    "*": (tagName, attributes) => ({
      tagName,
      attribs: sanitizeRichTextAttributes(tagName, attributes),
    }),
  },
};

export function sanitizeRichTextHtml(value) {
  return sanitizeHtml(String(value || ""), NODE_SANITIZE_OPTIONS);
}

export function sanitizeApplicationRichTextData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const sanitized = { ...value };

  for (const key of RICH_TEXT_FIELD_KEYS) {
    if (typeof sanitized[key] === "string")
      sanitized[key] = sanitizeRichTextHtml(sanitized[key]);
  }

  for (const collectionKey of ["people", "units"]) {
    if (!Array.isArray(sanitized[collectionKey])) continue;
    sanitized[collectionKey] = sanitized[collectionKey].map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record))
        return record;
      if (typeof record.contribution !== "string") return record;
      return {
        ...record,
        contribution: sanitizeRichTextHtml(record.contribution),
      };
    });
  }

  return sanitized;
}
