import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Combine,
  Eye,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  PaintBucket,
  Redo2,
  Rows3,
  Split,
  Strikethrough,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import DOMPurify from "dompurify";
import {
  RICH_TEXT_ALLOWED_ATTRIBUTE_NAMES,
  RICH_TEXT_ALLOWED_TAGS,
  sanitizeRichTextAttributes,
} from "./rich-text-policy.mjs";
import { RichTextCounter, RichTextGuidance } from "./RichTextGuidance.jsx";
import "./guidance.css";
const FONT_FAMILIES = [
  ["SimSun", "宋体"],
  ["SimHei", "黑体"],
  ["Microsoft YaHei", "微软雅黑"],
  ["KaiTi", "楷体"],
  ["FangSong", "仿宋"],
  ["YouYuan", "幼圆"],
  ["STKaiti", "华文楷体"],
  ["STSong", "华文宋体"],
  ["STHeiti", "华文黑体"],
  ["NSimSun", "新宋体"],
  ["DengXian", "等线"],
  ["Arial", "Arial"],
  ["Calibri", "Calibri"],
  ["Times New Roman", "Times New Roman"],
];
const FONT_SIZES = [
  ["42px", "初号"],
  ["36px", "小初"],
  ["26px", "一号"],
  ["24px", "小一"],
  ["22px", "二号"],
  ["18px", "小二"],
  ["16px", "三号"],
  ["15px", "小三"],
  ["14px", "四号"],
  ["12px", "小四"],
  ["10.5px", "五号"],
  ["9px", "小五"],
  ["7.5px", "六号"],
  ["6.5px", "小六"],
];
const EDITOR_ZOOM_DEFAULT = 100;
const EDITOR_ZOOM_MIN = 70;
const EDITOR_ZOOM_MAX = 150;
const EDITOR_ZOOM_STEP = 10;
const DEFAULT_CELL_STYLE =
  "border: 1px solid #aeb8c4; padding: 4px 6px; vertical-align: top";
const THEME_COLORS = [
  ["#000000", "黑色"],
  ["#ffffff", "白色"],
  ["#4472c4", "蓝色"],
  ["#ed7d31", "橙色"],
  ["#a5a5a5", "灰色"],
  ["#ffc000", "金色"],
  ["#70ad47", "绿色"],
  ["#5b9bd5", "浅蓝"],
  ["#264478", "深蓝"],
  ["#843c0c", "深橙"],
  ["#636363", "深灰"],
  ["#997300", "深金"],
  ["#375623", "深绿"],
];
const STANDARD_COLORS = [
  ["#c00000", "深红"],
  ["#ff0000", "红色"],
  ["#ffc000", "黄色"],
  ["#ffff00", "亮黄"],
  ["#92d050", "浅绿"],
  ["#00b050", "绿色"],
  ["#00b0f0", "青色"],
  ["#0070c0", "蓝色"],
  ["#002060", "藏蓝"],
  ["#7030a0", "紫色"],
];

const TextStyleWithFont = TextStyle.extend({
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => element.style.fontFamily || null,
            renderHTML: (attributes) =>
              attributes.fontFamily
                ? { style: `font-family: ${attributes.fontFamily}` }
                : {},
          },
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) =>
              attributes.fontSize
                ? { style: `font-size: ${attributes.fontSize}` }
                : {},
          },
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) =>
              attributes.backgroundColor
                ? { style: `background-color: ${attributes.backgroundColor}` }
                : {},
          },
        },
      },
    ];
  },
});

const StyledTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: DEFAULT_CELL_STYLE,
        parseHTML: (element) =>
          element.getAttribute("style") || DEFAULT_CELL_STYLE,
        renderHTML: (attributes) =>
          attributes.style ? { style: attributes.style } : {},
      },
    };
  },
});

const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: `${DEFAULT_CELL_STYLE}; font-weight: 700; background-color: #eef3f8`,
        parseHTML: (element) =>
          element.getAttribute("style") ||
          `${DEFAULT_CELL_STYLE}; font-weight: 700; background-color: #eef3f8`,
        renderHTML: (attributes) =>
          attributes.style ? { style: attributes.style } : {},
      },
    };
  },
});

const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
  ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTRIBUTE_NAMES],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: [
    "base",
    "form",
    "iframe",
    "object",
    "script",
    "style",
    "template",
  ],
  FORBID_ATTR: ["srcset", "onerror", "onload", "onclick", "onmouseover"],
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!node?.tagName || !node.attributes) return;
  const attributes = Object.fromEntries(
    [...node.attributes].map((attribute) => [attribute.name, attribute.value]),
  );
  const sanitized = sanitizeRichTextAttributes(node.tagName, attributes);
  for (const attribute of [...node.attributes])
    node.removeAttribute(attribute.name);
  for (const [name, value] of Object.entries(sanitized))
    node.setAttribute(name, value);
});

export function sanitizeRichText(value) {
  return DOMPurify.sanitize(String(value || ""), SANITIZE_OPTIONS);
}

export function isHtmlContent(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

export function richTextToPlain(value) {
  const source = String(value || "");
  if (!isHtmlContent(source)) return source;
  const documentNode = new DOMParser().parseFromString(source, "text/html");
  return (documentNode.body.textContent || "").trim();
}

export function toEditorHtml(value) {
  const source = String(value || "");
  if (!source) return "";
  if (isHtmlContent(source)) return sanitizeRichText(source);
  return source
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function RichTextPreviewDialog({ label, html, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="rich-preview-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="rich-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rich-preview-title"
      >
        <header className="rich-preview-dialog-head">
          <b id="rich-preview-title">预览</b>
          <button
            className="rich-preview-icon-button"
            type="button"
            autoFocus
            title="关闭预览"
            aria-label="关闭预览"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className="rich-preview-workspace">
          <article className="rich-editor-content rich-preview-paper">
            <h1 className="rich-preview-field-title">{label}</h1>
            <div
              className="rich-preview-document-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </article>
        </div>
        <footer className="rich-preview-dialog-actions">
          <button
            className="rich-preview-close-button"
            type="button"
            onClick={onClose}
          >
            关闭
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function apiFetch(url, options) {
  return fetch(url, options).then((response) => {
    if (response.status === 401)
      window.dispatchEvent(new Event("auth-expired"));
    return response;
  });
}

function RichTextButton({
  title,
  active = false,
  disabled = false,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={active ? "rich-tool active" : "rich-tool"}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ColorPalette({
  paletteId,
  title,
  value,
  onChange,
  icon,
  open,
  onOpenChange,
  noColorLabel = "自动",
}) {
  const paletteRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!paletteRef.current?.contains(event.target)) onOpenChange(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onOpenChange]);

  const choose = (color) => {
    onChange(color);
    onOpenChange(false);
  };
  const swatch = (color, label) => (
    <button
      key={`${label}-${color}`}
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => choose(color)}
      style={{
        width: 18,
        height: 18,
        padding: 0,
        border: value === color ? "2px solid #1769d2" : "1px solid #c5cbd3",
        background: color,
        boxShadow: color === "#ffffff" ? "inset 0 0 0 1px #e8ebef" : "none",
        cursor: "pointer",
      }}
    />
  );
  return (
    <div
      ref={paletteRef}
      className="rich-color"
      title={title}
      style={{ position: "relative" }}
    >
      <button
        type="button"
        className="rich-color-trigger"
        aria-label={title}
        aria-expanded={open}
        aria-controls={`${paletteId}-palette`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onOpenChange(!open)}
        style={{
          width: 29,
          height: 29,
          padding: 0,
          border: 0,
          background: "transparent",
          color: value || "#263449",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
        }}
      >
        {icon}
      </button>
      {open && (
        <div
          id={`${paletteId}-palette`}
          role="menu"
          aria-label={`${title}颜色面板`}
          onMouseDown={(event) => event.preventDefault()}
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 6px)",
            left: 0,
            width: 238,
            boxSizing: "border-box",
            padding: "8px 9px 10px",
            border: "1px solid #c9d0d9",
            borderRadius: 3,
            background: "#fff",
            boxShadow: "0 4px 14px rgba(26,39,57,.2)",
          }}
        >
          <button
            type="button"
            onClick={() => choose(null)}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 7,
              padding: "4px 5px",
              border: "1px solid #e2e6eb",
              background: "#fff",
              color: "#344154",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {noColorLabel === "自动" ? "自动（无颜色）" : noColorLabel}
          </button>
          <div style={{ color: "#6e7b8c", fontSize: 11, marginBottom: 4 }}>
            主题颜色
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 18px)",
              gap: 4,
              marginBottom: 8,
            }}
          >
            {THEME_COLORS.map(([color, label]) => swatch(color, label))}
          </div>
          <div style={{ color: "#6e7b8c", fontSize: 11, marginBottom: 4 }}>
            标准色
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(10, 18px)",
              gap: 4,
            }}
          >
            {STANDARD_COLORS.map(([color, label]) => swatch(color, label))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  applicationId,
  fieldKey,
  label,
}) {
  const imageInput = useRef(null);
  const canvasRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [openColorPalette, setOpenColorPalette] = useState(null);
  const [viewZoom, setViewZoom] = useState(EDITOR_ZOOM_DEFAULT);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      Image.configure({ allowBase64: false, inline: false }),
      TextStyleWithFont,
      Color,
      Table.configure({
        resizable: true,
        renderWrapper: true,
        cellMinWidth: 60,
        allowTableNodeSelection: true,
        HTMLAttributes: { style: "border-collapse: collapse; width: 100%" },
      }),
      TableRow,
      StyledTableHeader,
      StyledTableCell,
    ],
    content: toEditorHtml(value),
    editorProps: {
      transformPastedHTML: (html) => sanitizeRichText(html),
      attributes: {
        class: "rich-editor-content",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.isEmpty
        ? ""
        : sanitizeRichText(currentEditor.getHTML());
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const normalized = toEditorHtml(value);
    const current = editor.isEmpty ? "" : sanitizeRichText(editor.getHTML());
    if (current !== normalized)
      editor.commands.setContent(normalized, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editor) return undefined;

    const handleWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !editor.isFocused) return;

      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setViewZoom((current) =>
        Math.min(
          EDITOR_ZOOM_MAX,
          Math.max(EDITOR_ZOOM_MIN, current + direction * EDITOR_ZOOM_STEP),
        ),
      );
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [editor]);

  if (!editor)
    return (
      <div className="rich-editor rich-editor--loading">正在载入编辑器…</div>
    );

  const run = (command) => editor.chain().focus()[command]().run();
  const insertTable = () => {
    const rows = Number(window.prompt("请输入表格行数（1-20）", "3"));
    const cols = Number(window.prompt("请输入表格列数（1-12）", "3"));
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(cols) ||
      rows < 1 ||
      rows > 20 ||
      cols < 1 ||
      cols > 12
    )
      return;
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
  };
  const setCellBorder = (border) => {
    const current =
      editor.getAttributes("tableCell").style ||
      editor.getAttributes("tableHeader").style ||
      DEFAULT_CELL_STYLE;
    const withoutBorder = current.replace(/border:\s*[^;]+;?/i, "").trim();
    const style = `${withoutBorder}${withoutBorder ? "; " : ""}border: ${border}`;
    editor.chain().focus().setCellAttribute("style", style).run();
  };
  const setCellBackground = (color) => {
    const current =
      editor.getAttributes("tableCell").style ||
      editor.getAttributes("tableHeader").style ||
      DEFAULT_CELL_STYLE;
    const withoutBackground = current
      .replace(/background-color:\s*[^;]+;?/i, "")
      .trim();
    const style = color
      ? `${withoutBackground}${withoutBackground ? "; " : ""}background-color: ${color}`
      : withoutBackground;
    editor.chain().focus().setCellAttribute("style", style).run();
  };
  const currentCellStyle =
    editor.getAttributes("tableCell").style ||
    editor.getAttributes("tableHeader").style ||
    DEFAULT_CELL_STYLE;
  const setLink = () => {
    const current = editor.getAttributes("link").href || "";
    const href = window.prompt("请输入链接地址", current);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: href.trim() })
        .run();
  };
  const uploadImage = async (file) => {
    if (!file || !editor) return;
    if (!file.type.startsWith("image/")) {
      window.alert("请选择图片文件");
      return;
    }
    setUploadingImage(true);
    const body = new FormData();
    body.append("file", file);
    body.append("category", `content_image:${fieldKey}`);
    try {
      const response = await apiFetch(
        `/api/applications/${applicationId}/files`,
        { method: "POST", body },
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "图片上传失败");
      editor
        .chain()
        .focus()
        .setImage({
          src: `/api/applications/${applicationId}/files/${payload.file.id}/download?inline=1`,
          alt: file.name,
          title: file.name,
        })
        .run();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setUploadingImage(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };

  const resetViewZoom = () => setViewZoom(EDITOR_ZOOM_DEFAULT);

  return (
    <div className="rich-editor">
      {previewing && (
        <RichTextPreviewDialog
          label={label}
          html={editor.isEmpty ? "" : sanitizeRichText(editor.getHTML())}
          onClose={() => setPreviewing(false)}
        />
      )}
      <RichTextGuidance fieldKey={fieldKey} />
      <div
        className="rich-toolbar"
        role="toolbar"
        aria-label={`${label}格式工具栏`}
      >
        <select
          className="rich-block-select"
          value={
            [1, 2, 3, 4]
              .map((level) => `h${level}`)
              .find((heading) =>
                editor.isActive("heading", { level: Number(heading.slice(1)) }),
              ) || "p"
          }
          onChange={(event) => {
            const type = event.target.value;
            if (type === "p") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(type.slice(1)) })
                .run();
          }}
          aria-label="段落样式"
        >
          <option value="p">正文</option>
          <option value="h1">大纲 1 级</option>
          <option value="h2">大纲 2 级</option>
          <option value="h3">大纲 3 级</option>
          <option value="h4">大纲 4 级</option>
        </select>
        <select
          className="rich-block-select"
          value={editor.getAttributes("textStyle").fontFamily || "SimSun"}
          onChange={(event) =>
            editor
              .chain()
              .focus()
              .setMark("textStyle", { fontFamily: event.target.value })
              .run()
          }
          aria-label="字体"
        >
          {FONT_FAMILIES.map(([value, labelText]) => (
            <option key={value} value={value}>
              {labelText}
            </option>
          ))}
        </select>
        <select
          className="rich-block-select"
          value={editor.getAttributes("textStyle").fontSize || "14px"}
          onChange={(event) =>
            editor
              .chain()
              .focus()
              .setMark("textStyle", { fontSize: event.target.value })
              .run()
          }
          aria-label="字号"
        >
          {FONT_SIZES.map(([size, labelText]) => (
            <option key={size} value={size}>
              {labelText}
            </option>
          ))}
        </select>
        <ColorPalette
          paletteId="font-color"
          title="字体颜色"
          value={editor.getAttributes("textStyle").color || null}
          onChange={(color) =>
            color
              ? editor.chain().focus().setColor(color).run()
              : editor.chain().focus().unsetColor().run()
          }
          open={openColorPalette === "font-color"}
          onOpenChange={(open) =>
            setOpenColorPalette(open ? "font-color" : null)
          }
          icon={
            <span
              style={{
                fontWeight: 700,
                borderBottom: `3px solid ${editor.getAttributes("textStyle").color || "#263449"}`,
              }}
            >
              A
            </span>
          }
        />
        <ColorPalette
          paletteId="text-background"
          title="背景颜色"
          value={editor.getAttributes("textStyle").backgroundColor || null}
          onChange={(color) =>
            editor
              .chain()
              .focus()
              .setMark("textStyle", { backgroundColor: color })
              .run()
          }
          open={openColorPalette === "text-background"}
          onOpenChange={(open) =>
            setOpenColorPalette(open ? "text-background" : null)
          }
          noColorLabel="无颜色"
          icon={<PaintBucket size={15} />}
        />
        <span className="rich-tool-group">
          <RichTextButton
            title="加粗"
            active={editor.isActive("bold")}
            onClick={() => run("toggleBold")}
          >
            <Bold size={16} />
          </RichTextButton>
          <RichTextButton
            title="斜体"
            active={editor.isActive("italic")}
            onClick={() => run("toggleItalic")}
          >
            <Italic size={16} />
          </RichTextButton>
          <RichTextButton
            title="下划线"
            active={editor.isActive("underline")}
            onClick={() => run("toggleUnderline")}
          >
            <UnderlineIcon size={16} />
          </RichTextButton>
          <RichTextButton
            title="删除线"
            active={editor.isActive("strike")}
            onClick={() => run("toggleStrike")}
          >
            <Strikethrough size={16} />
          </RichTextButton>
        </span>
        <span className="rich-tool-group">
          <RichTextButton
            title="左对齐"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft size={16} />
          </RichTextButton>
          <RichTextButton
            title="居中"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter size={16} />
          </RichTextButton>
          <RichTextButton
            title="右对齐"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight size={16} />
          </RichTextButton>
          <RichTextButton
            title="两端对齐"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          >
            <AlignJustify size={16} />
          </RichTextButton>
        </span>
        <span className="rich-tool-group">
          <RichTextButton
            title="项目符号列表"
            active={editor.isActive("bulletList")}
            onClick={() => run("toggleBulletList")}
          >
            <List size={16} />
          </RichTextButton>
          <RichTextButton
            title="编号列表"
            active={editor.isActive("orderedList")}
            onClick={() => run("toggleOrderedList")}
          >
            <ListOrdered size={16} />
          </RichTextButton>
          <RichTextButton
            title="插入链接"
            active={editor.isActive("link")}
            onClick={setLink}
          >
            <Link2 size={16} />
          </RichTextButton>
          <RichTextButton
            title="插入图片"
            disabled={uploadingImage}
            onClick={() => imageInput.current?.click()}
          >
            {uploadingImage ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ImagePlus size={16} />
            )}
          </RichTextButton>
          <input
            ref={imageInput}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => uploadImage(event.target.files?.[0])}
          />
        </span>
        <span className="rich-tool-group rich-tool-group--table">
          <RichTextButton title="插入表格" onClick={insertTable}>
            <Table2 size={16} />
          </RichTextButton>
          <RichTextButton
            title="当前行后插入行"
            disabled={!editor.can().addRowAfter()}
            onClick={() => run("addRowAfter")}
          >
            <Rows3 size={16} />
          </RichTextButton>
          <RichTextButton
            title="当前列后插入列"
            disabled={!editor.can().addColumnAfter()}
            onClick={() => run("addColumnAfter")}
          >
            <Columns3 size={16} />
          </RichTextButton>
          <RichTextButton
            title="删除当前行"
            disabled={!editor.can().deleteRow()}
            onClick={() => run("deleteRow")}
          >
            <TableRowsSplit size={16} />
          </RichTextButton>
          <RichTextButton
            title="删除当前列"
            disabled={!editor.can().deleteColumn()}
            onClick={() => run("deleteColumn")}
          >
            <TableColumnsSplit size={16} />
          </RichTextButton>
          <RichTextButton
            title="合并单元格"
            disabled={!editor.can().mergeCells()}
            onClick={() => run("mergeCells")}
          >
            <Combine size={16} />
          </RichTextButton>
          <RichTextButton
            title="拆分单元格"
            disabled={!editor.can().splitCell()}
            onClick={() => run("splitCell")}
          >
            <Split size={16} />
          </RichTextButton>
          <RichTextButton
            title="删除表格"
            disabled={!editor.isActive("table")}
            onClick={() => run("deleteTable")}
          >
            <Trash2 size={16} />
          </RichTextButton>
          <select
            className="rich-block-select rich-table-border-select"
            aria-label="表格边框"
            defaultValue="1px solid #aeb8c4"
            onChange={(event) => setCellBorder(event.target.value)}
          >
            <option value="1px solid #aeb8c4">细边框</option>
            <option value="2px solid #526273">粗边框</option>
            <option value="1px dashed #aeb8c4">虚线边框</option>
            <option value="none">无边框</option>
          </select>
          <ColorPalette
            paletteId="cell-background"
            title="单元格背景颜色"
            value={
              (
                currentCellStyle.match(/background-color:\s*([^;]+)/i)?.[1] ||
                ""
              ).trim() || null
            }
            onChange={setCellBackground}
            open={openColorPalette === "cell-background"}
            onOpenChange={(open) =>
              setOpenColorPalette(open ? "cell-background" : null)
            }
            noColorLabel="无颜色"
            icon={<PaintBucket size={15} />}
          />
        </span>
        <span className="rich-tool-group rich-tool-group--preview">
          <RichTextButton
            title="预览"
            onClick={() => {
              setOpenColorPalette(null);
              setPreviewing(true);
            }}
          >
            <Eye size={16} />
          </RichTextButton>
        </span>
        <span
          className="rich-zoom-controls"
          aria-label="编辑器视图缩放"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginLeft: "auto",
            paddingLeft: 7,
            borderLeft: "1px solid #e3e7ec",
            color: "#576579",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          <span aria-live="polite">{viewZoom}%</span>
          <button
            type="button"
            title="复位视图缩放"
            aria-label="复位视图缩放"
            onMouseDown={(event) => event.preventDefault()}
            onClick={resetViewZoom}
            style={{
              minWidth: 38,
              height: 26,
              padding: "0 6px",
              border: "1px solid #d7dde5",
              borderRadius: 3,
              color: "#576579",
              background: "#fff",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            复位
          </button>
        </span>
        <span className="rich-tool-group rich-tool-group--history">
          <RichTextButton
            title="撤销"
            disabled={!editor.can().undo()}
            onClick={() => run("undo")}
          >
            <Undo2 size={16} />
          </RichTextButton>
          <RichTextButton
            title="重做"
            disabled={!editor.can().redo()}
            onClick={() => run("redo")}
          >
            <Redo2 size={16} />
          </RichTextButton>
        </span>
      </div>
      <div ref={canvasRef} className="rich-editor-canvas">
        <div
          style={{
            transform: `scale(${viewZoom / 100})`,
            transformOrigin: "top center",
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <RichTextCounter fieldKey={fieldKey} value={value} />
    </div>
  );
}

export function CharacterCount({ value, max }) {
  const count = richTextToPlain(value).length;
  return (
    <span
      className={count > max ? "char-count char-count--over" : "char-count"}
    >
      {count} / {max}
    </span>
  );
}
