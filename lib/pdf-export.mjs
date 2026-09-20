import { existsSync } from "node:fs";
import { chromium } from "playwright";

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
  const context = await browser.newContext({ javaScriptEnabled: false });
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
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><base href="${baseUrl}/">${styles}<style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        .pdf-export-document { margin: 0 !important; padding: 0 !important; }
        .pdf-export-document > .preview-page {
          display: block !important;
          margin: 0 !important;
          box-shadow: none !important;
          break-after: page !important;
          page-break-after: always !important;
          overflow: hidden !important;
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
    await page.evaluate(async () => {
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
    });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: true,
    });
  } finally {
    await context.close();
  }
}
