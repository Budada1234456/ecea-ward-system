export const RICH_TEXT_ALLOWED_TAGS = Object.freeze([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "span",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "colgroup",
  "col",
]);

export const RICH_TEXT_ALLOWED_ATTRIBUTES = Object.freeze({
  "*": Object.freeze(["style", "title"]),
  a: Object.freeze(["href", "target", "rel"]),
  img: Object.freeze(["src", "alt", "width"]),
  table: Object.freeze(["width"]),
  td: Object.freeze([
    "colspan",
    "rowspan",
    "colwidth",
    "data-colwidth",
    "width",
  ]),
  th: Object.freeze([
    "colspan",
    "rowspan",
    "colwidth",
    "data-colwidth",
    "width",
  ]),
  col: Object.freeze(["width"]),
});

export const RICH_TEXT_ALLOWED_ATTRIBUTE_NAMES = Object.freeze([
  ...new Set(Object.values(RICH_TEXT_ALLOWED_ATTRIBUTES).flat()),
]);

export const RICH_TEXT_ALLOWED_CSS_PROPERTIES = Object.freeze([
  "font-family",
  "font-size",
  "color",
  "background-color",
  "text-align",
  "font-weight",
  "border",
  "border-width",
  "border-style",
  "border-color",
  "border-collapse",
  "padding",
  "vertical-align",
  "width",
  "min-width",
]);

export const RICH_TEXT_FIELD_KEYS = Object.freeze([
  "introduction",
  "background",
  "technicalContent",
  "innovations",
  "comparison",
  "application",
  "economic",
  "social",
  "technicalEvaluation",
  "recommendation",
  "peopleCooperation",
  "unitContribution",
  "transformation",
]);

const FONT_FAMILIES = new Set([
  "SimSun",
  "SimHei",
  "Microsoft YaHei",
  "KaiTi",
  "FangSong",
  "YouYuan",
  "STKaiti",
  "STSong",
  "STHeiti",
  "NSimSun",
  "DengXian",
  "Arial",
  "Calibri",
  "Times New Roman",
]);

const FONT_SIZES = new Set([
  "42px",
  "36px",
  "26px",
  "24px",
  "22px",
  "18px",
  "16px",
  "15px",
  "14px",
  "12px",
  "10.5px",
  "9px",
  "7.5px",
  "6.5px",
]);

const CSS_PROPERTIES = new Set(RICH_TEXT_ALLOWED_CSS_PROPERTIES);
const GLOBAL_ATTRIBUTES = new Set(RICH_TEXT_ALLOWED_ATTRIBUTES["*"]);
const URL_ATTRIBUTES = new Set(["href", "src"]);

export function isAllowedRichTextUrl(value) {
  const url = String(value || "").trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url) || url.includes("\\"))
    return false;
  if (/^[/\\]{2}/.test(url)) return false;
  return /^(?:(?:https?|mailto):|\/(?!\/)|#)/i.test(url);
}

export function sanitizeRichTextStyle(value) {
  return String(value || "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return null;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const cssValue = declaration.slice(separator + 1).trim();
      if (!CSS_PROPERTIES.has(property) || !cssValue) return null;
      if (/url\s*\(|expression\s*\(|@import|[<>]/i.test(cssValue)) return null;
      if (property === "font-family") {
        const family = cssValue.replace(/["']/g, "");
        return FONT_FAMILIES.has(family) ? `${property}: ${cssValue}` : null;
      }
      if (property === "font-size")
        return FONT_SIZES.has(cssValue) ? `${property}: ${cssValue}` : null;
      if (property === "text-align")
        return ["left", "center", "right", "justify"].includes(
          cssValue.toLowerCase(),
        )
          ? `${property}: ${cssValue}`
          : null;
      if (property === "font-weight")
        return ["400", "500", "600", "700", "bold", "normal"].includes(
          cssValue.toLowerCase(),
        )
          ? `${property}: ${cssValue}`
          : null;
      if (["background-color", "border-color", "color"].includes(property))
        return /^(#[0-9a-f]{3,8}|rgb\(\s*[\d\s%,.]+\s*\)|rgba\(\s*[\d\s%,.]+\s*\)|transparent)$/i.test(
          cssValue,
        )
          ? `${property}: ${cssValue}`
          : null;
      if (property === "border")
        return /^(none|0|[1-9]\d*px\s+(solid|dashed|dotted)\s+(#[0-9a-f]{3,8}|black|white|gray))$/i.test(
          cssValue,
        )
          ? `${property}: ${cssValue}`
          : null;
      if (["border-width", "padding"].includes(property))
        return /^\d+(?:\.\d+)?px(?:\s+\d+(?:\.\d+)?px){0,3}$/.test(cssValue)
          ? `${property}: ${cssValue}`
          : null;
      if (property === "border-style")
        return ["none", "solid", "dashed", "dotted"].includes(
          cssValue.toLowerCase(),
        )
          ? `${property}: ${cssValue}`
          : null;
      if (property === "border-collapse")
        return ["collapse", "separate"].includes(cssValue.toLowerCase())
          ? `${property}: ${cssValue}`
          : null;
      if (property === "vertical-align")
        return ["top", "middle", "bottom"].includes(cssValue.toLowerCase())
          ? `${property}: ${cssValue}`
          : null;
      if (["width", "min-width"].includes(property))
        return /^\d+(?:\.\d+)?(?:px|%)$/.test(cssValue)
          ? `${property}: ${cssValue}`
          : null;
      return null;
    })
    .filter(Boolean)
    .join("; ");
}

function isAttributeAllowed(tagName, attributeName) {
  const tagAttributes = RICH_TEXT_ALLOWED_ATTRIBUTES[tagName] || [];
  return (
    GLOBAL_ATTRIBUTES.has(attributeName) ||
    tagAttributes.includes(attributeName)
  );
}

function sanitizeDimension(value) {
  const dimension = String(value || "").trim();
  return /^\d+(?:\.\d+)?(?:px|%)?$/.test(dimension) ? dimension : null;
}

export function sanitizeRichTextAttributes(tagName, attributes = {}) {
  const tag = String(tagName || "").toLowerCase();
  const sanitized = {};

  for (const [rawName, rawValue] of Object.entries(attributes)) {
    const name = String(rawName).toLowerCase();
    const value = String(rawValue || "").trim();
    if (!isAttributeAllowed(tag, name)) continue;
    if (name === "style") {
      const style = sanitizeRichTextStyle(value);
      if (style) sanitized.style = style;
      continue;
    }
    if (URL_ATTRIBUTES.has(name)) {
      if (isAllowedRichTextUrl(value)) sanitized[name] = value;
      continue;
    }
    if (name === "target") {
      if (["_blank", "_self"].includes(value.toLowerCase()))
        sanitized.target = value.toLowerCase();
      continue;
    }
    if (["colspan", "rowspan"].includes(name)) {
      if (/^[1-9]\d{0,2}$/.test(value)) sanitized[name] = value;
      continue;
    }
    if (name === "colwidth" || name === "data-colwidth") {
      if (/^[1-9]\d*(?:,[1-9]\d*)*$/.test(value)) sanitized[name] = value;
      continue;
    }
    if (name === "width") {
      const width = sanitizeDimension(value);
      if (width) sanitized.width = width;
      continue;
    }
    sanitized[name] = value;
  }

  if (tag === "a" && sanitized.href && sanitized.target === "_blank")
    sanitized.rel = "noopener noreferrer";
  else if (tag === "a" && sanitized.rel)
    sanitized.rel = sanitized.rel
      .split(/\s+/)
      .filter((token) =>
        ["noopener", "noreferrer", "nofollow"].includes(token.toLowerCase()),
      )
      .join(" ");
  if (tag === "a" && !sanitized.href) {
    delete sanitized.target;
    delete sanitized.rel;
  }

  return sanitized;
}
