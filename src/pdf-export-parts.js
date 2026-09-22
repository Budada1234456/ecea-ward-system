export const PDF_EXPORT_HTML_PART_LIMIT = 8 * 1024 * 1024;
export const PDF_EXPORT_SINGLE_PAGE_LIMIT = 32 * 1024 * 1024;
export const PDF_EXPORT_TOTAL_HTML_LIMIT = 80 * 1024 * 1024;

export function chunkPdfExportHtmlPages(
  serializedPages,
  partLimit = PDF_EXPORT_HTML_PART_LIMIT,
) {
  const parts = [];
  let html = "";

  const flush = () => {
    if (html) parts.push({ type: "html", html });
    html = "";
  };

  for (const page of serializedPages) {
    const source = String(page || "");
    if (!source) continue;
    if (source.length > PDF_EXPORT_SINGLE_PAGE_LIMIT) {
      throw new Error("单页中的图片或内容过大，请压缩图片后重试");
    }
    if (html && html.length + source.length > partLimit) flush();
    html += source;
  }
  flush();
  return parts;
}
