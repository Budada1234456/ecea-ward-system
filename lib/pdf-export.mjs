import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const chromiumCandidates = () =>
  [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter((candidate) => candidate && existsSync(candidate));

let browserPromise;

async function browserInstance() {
  if (!browserPromise) {
    const executablePath = chromiumCandidates()[0];
    if (!executablePath) {
      throw new Error(
        "服务器未安装 Chromium，无法生成 PDF；请执行 npx playwright install chromium",
      );
    }
    browserPromise = chromium
      .launch({
        executablePath,
        headless: true,
        args: ["--disable-dev-shm-usage"],
      })
      .then((browser) => {
        browser.on("disconnected", () => {
          browserPromise = undefined;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = undefined;
        throw error;
      });
  }
  return browserPromise;
}

export async function renderPreviewPdf({
  html,
  styles,
  baseUrl,
  sessionToken,
}) {
  const browser = await browserInstance();
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 794, height: 1123 },
  });
  try {
    if (sessionToken) {
      await context.addCookies([
        {
          name: "award_session",
          value: sessionToken,
          url: baseUrl,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
    const page = await context.newPage();
    const allowedOrigin = new URL(baseUrl).origin;
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (
        url.startsWith(allowedOrigin) ||
        url.startsWith("data:") ||
        url === "about:blank"
      ) {
        await route.continue();
      } else {
        await route.abort();
      }
    });
    // setContent preserves the current document's origin. Establishing the app
    // origin first lets crossorigin styles and credentialed preview images load.
    await page.goto(`${baseUrl}/api/health`, {
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><base href="${baseUrl}/">${styles}<style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        .pdf-export-document {
          width: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .pdf-export-document > .preview-page {
          display: block !important;
          width: 210mm !important;
          min-height: 297mm !important;
          height: 297mm !important;
          max-height: 297mm !important;
          margin: 0 !important;
          box-shadow: none !important;
          break-after: page !important;
          page-break-after: always !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          overflow: hidden !important;
        }
        .pdf-export-document > .preview-page * {
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
        .pdf-export-document > .preview-page:last-child {
          break-after: auto !important;
          page-break-after: auto !important;
        }
        .pdf-export-document > section.docx.preview-submitted-page {
          padding: 16.5mm 12.5mm 18.5mm 15.9mm !important;
        }
      </style></head><body><main class="pdf-export-document">${html}</main></body></html>`,
      { waitUntil: "networkidle", timeout: 30_000 },
    );
    const renderState = await page.evaluate(async () => {
      await document.fonts?.ready;
      await Promise.all(
        [...document.images].map((image) =>
          image.complete
            ? image.decode?.().catch(() => {})
            : new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
              }),
        ),
      );
      const applicationPage = document.querySelector(
        ".preview-page:not(.preview-submitted-page)",
      );
      const failedImages = [...document.images].filter(
        (image) => !image.complete || image.naturalWidth === 0,
      );
      const failedSubmittedImages = failedImages
        .filter((image) => image.closest(".preview-submitted-page"))
        .map((image) => image.currentSrc || image.src);
      failedImages
        .filter((image) => !image.closest(".preview-submitted-page"))
        .forEach((image) => {
          image.style.visibility = "hidden";
        });
      return {
        failedSubmittedImages,
        applicationPageWidth: applicationPage
          ? applicationPage.getBoundingClientRect().width
          : null,
        applicationPagePadding: applicationPage
          ? Number.parseFloat(getComputedStyle(applicationPage).paddingTop)
          : null,
      };
    });
    if (
      renderState.applicationPageWidth !== null &&
      (renderState.applicationPageWidth < 790 ||
        renderState.applicationPageWidth > 795 ||
        renderState.applicationPagePadding < 40)
    ) {
      throw new Error("预览样式未能完整加载，请刷新页面后重试");
    }
    if (renderState.failedSubmittedImages.length) {
      throw new Error("预览中的图片未能完整加载，请刷新页面后重试");
    }
    return await page.pdf({
      format: "A4",
      scale: 1,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: true,
    });
  } finally {
    await context.close();
  }
}

export async function mergePreviewPdfParts(parts) {
  if (parts.length === 1 && !parts[0].addPageNumbers) return parts[0].pdf;

  const merged = await PDFDocument.create();
  const pageNumberFont = await merged.embedFont(StandardFonts.Helvetica);
  for (const part of parts) {
    const source = await PDFDocument.load(part.pdf, { ignoreEncryption: true });
    const copiedPages = await merged.copyPages(source, source.getPageIndices());
    for (const page of copiedPages) {
      merged.addPage(page);
      if (!part.addPageNumbers) continue;
      const pageNumber = String(merged.getPageCount());
      const fontSize = 9;
      const textWidth = pageNumberFont.widthOfTextAtSize(pageNumber, fontSize);
      const { width } = page.getSize();
      page.drawRectangle({
        x: width / 2 - textWidth / 2 - 4,
        y: 10,
        width: textWidth + 8,
        height: 14,
        color: rgb(1, 1, 1),
        opacity: 0.94,
      });
      page.drawText(pageNumber, {
        x: width / 2 - textWidth / 2,
        y: 13,
        size: fontSize,
        font: pageNumberFont,
        color: rgb(0, 0, 0),
      });
    }
  }
  return merged.save({ useObjectStreams: true });
}
