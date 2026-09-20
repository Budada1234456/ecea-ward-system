import assert from "node:assert/strict";
import test from "node:test";
import {
  PDF_EXPORT_HTML_PART_LIMIT,
  chunkPdfExportHtmlPages,
} from "../src/pdf-export-parts.js";

for (const profileCode of ["achievement", "progress", "invention"]) {
  test(`${profileCode} export splits HTML larger than the legacy 10 MB limit`, () => {
    const padding = "x".repeat(2_700_000);
    const pages = Array.from(
      { length: 4 },
      (_, index) =>
        `<article class="preview-page preview-${profileCode}-document" data-page="${index + 1}" data-padding="${padding}"></article>`,
    );
    const parts = chunkPdfExportHtmlPages(pages);

    assert.ok(pages.join("").length > 10 * 1024 * 1024);
    assert.ok(parts.length > 1);
    assert.ok(
      parts.every(
        (part) =>
          part.type === "html" &&
          part.html.length <= PDF_EXPORT_HTML_PART_LIMIT,
      ),
    );
    assert.equal(parts.map((part) => part.html).join(""), pages.join(""));
  });
}
