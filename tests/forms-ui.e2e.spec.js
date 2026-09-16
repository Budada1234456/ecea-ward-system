import { expect, test } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

test("structured forms, entity ordering and discipline tree work responsively", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(5_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `formtest${suffix}`;
  const password = `FormTest-${suffix}`;
  const title = `表单组件验收项目-${suffix}`;
  const errors = [];
  let applicationId;
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const registerResponse = await page.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: {
        username,
        email: `${username}@example.test`,
        displayName: "表单验收用户",
        password,
      },
    },
  );
  const registerBody = await registerResponse.text();
  expect(registerResponse.ok(), registerBody).toBe(true);

  const createResponse = await page.request.post(
    `${baseUrl}/api/applications`,
    {
      data: {
        title,
        year: 2026,
        awardType: "节能减排科技进步奖",
        workflowMode: "form",
      },
    },
  );
  const createBody = await createResponse.text();
  expect(createResponse.ok(), createBody).toBe(true);
  applicationId = JSON.parse(createBody).application.id;

  try {
    const seedResponse = await page.request.put(
      `${baseUrl}/api/applications/${applicationId}`,
      {
        data: {
          data: {
            projectName: title,
            awardRecords: [{ name: "节能技术成果奖", award: "示范奖" }],
            ipRecords: [
              { name: "旧数据专利", number: "CN-LEGACY-1" },
              { name: "待删除专利" },
            ],
            paperRecords: [{ title: "节能技术论著", publisher: "科技出版社" }],
            applicationUnits: [
              { unitName: "示范应用单位", technology: "节能技术" },
            ],
            economicSummary: { totalInvestment: "200", paybackYears: "3" },
            economicRecords: [{ year: "2025", newSales: "100" }],
            cooperationRecords: [
              { method: "共同研发", collaborators: "甲完成人、乙完成人" },
            ],
            people: [
              {
                id: "person-a",
                name: "甲完成人",
                nativePlace: "北京市",
                contribution: "贡献甲",
              },
              { id: "person-b", name: "乙完成人", contribution: "贡献乙" },
            ],
            units: [
              { name: "甲完成单位", contribution: "贡献甲" },
              { name: "乙完成单位", contribution: "贡献乙" },
            ],
          },
        },
      },
    );
    expect(seedResponse.ok(), await seedResponse.text()).toBe(true);

    await page.goto(baseUrl);
    await expect(
      page.getByRole("heading", { name: "我的申报项目" }),
    ).toBeVisible();
    await page.getByRole("button", { name: title, exact: true }).click();

    const disciplineInput = page.getByRole("combobox", { name: "检索学科" });
    await disciplineInput.focus();
    const energyOption = page.getByRole("option", {
      name: /能源科学技术.*480/,
    });
    await expect(energyOption).toBeVisible();
    await page
      .getByRole("button", { name: "展开能源科学技术的下级学科" })
      .click();
    await expect(
      page.getByRole("navigation", { name: "学科层级路径" }),
    ).toContainText("能源科学技术");
    const levelTwoOption = page.getByRole("option", {
      name: /一次能源.*48060/,
    });
    await expect(levelTwoOption).toBeDisabled();
    await page.getByRole("button", { name: "展开一次能源的下级学科" }).click();
    await page.getByRole("option", { name: /煤炭能.*4806010/ }).click();
    await expect(page.getByLabel("已选学科")).toContainText(
      "能源科学技术（480） / 一次能源（48060） / 煤炭能（4806010）",
    );

    await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole("button", { name: /知识产权情况/ }).click();
    await page.getByRole("button", { name: "添加记录" }).click();
    const names = page.getByLabel("授权（申请）项目名称");
    await expect(names).toHaveCount(3);
    await names.nth(2).blur();
    await expect(page.getByText("请填写授权（申请）项目名称")).toBeVisible();
    await page
      .getByRole("region", { name: "结构化数据表" })
      .getByRole("button", { name: "删除第2条记录" })
      .click();
    await expect(names).toHaveCount(2);
    await expect(page.getByText("请填写授权（申请）项目名称")).toBeVisible();
    await names.last().fill("新增专利");
    await expect(page.locator(".structured-table__hint").first()).toBeVisible();
    const scroll = page.locator(".structured-table__scroll").first();
    const stickyColumns = await scroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      const bounds = element.getBoundingClientRect();
      const first = element
        .querySelector(".structured-table__row .structured-table__sticky-start")
        .getBoundingClientRect();
      const last = element
        .querySelector(".structured-table__row .structured-table__sticky-end")
        .getBoundingClientRect();
      return {
        scrolled: element.scrollLeft > 0,
        firstVisible:
          first.left >= bounds.left - 1 && first.right <= bounds.right + 1,
        lastVisible:
          last.left >= bounds.left - 1 && last.right <= bounds.right + 1,
      };
    });
    expect(stickyColumns).toEqual({
      scrolled: true,
      firstVisible: true,
      lastVisible: true,
    });

    await page.getByRole("button", { name: /主要完成人/ }).click();
    const secondPerson = page
      .getByLabel("完成人列表")
      .locator(".entity-editor__list-item")
      .filter({ hasText: "乙完成人" })
      .locator(".entity-editor__select");
    await secondPerson.click();
    await page
      .getByLabel("完成人列表")
      .getByRole("button", { name: "上移乙完成人" })
      .click();
    await expect(
      page
        .getByLabel("完成人列表")
        .locator(".entity-editor__list-item")
        .first(),
    ).toContainText("乙完成人");
    await expect(page.getByLabel("排名")).toHaveValue("1");
    await expect
      .poll(async () => {
        const response = await page.request.get(
          `${baseUrl}/api/applications/${applicationId}`,
        );
        const payload = await response.json();
        return payload.application.data.people?.map(({ name, rank }) => ({
          name,
          rank,
        }));
      })
      .toEqual([
        { name: "乙完成人", rank: 1 },
        { name: "甲完成人", rank: 2 },
      ]);

    const persistedResponse = await page.request.get(
      `${baseUrl}/api/applications/${applicationId}`,
    );
    const persisted = (await persistedResponse.json()).application.data;
    for (const group of [
      "awardRecords",
      "ipRecords",
      "paperRecords",
      "applicationUnits",
      "economicRecords",
      "cooperationRecords",
      "people",
      "units",
    ]) {
      expect(
        persisted[group][0].id,
        `${group} should persist a stable id`,
      ).toBeTruthy();
    }

    await page.reload();
    await expect(page.locator(".draft-title")).toHaveText(title);
    await page.getByRole("button", { name: /曾获奖励情况/ }).click();
    await expect(page.getByLabel("获奖项目名称")).toHaveValue("节能技术成果奖");
    await page.getByRole("button", { name: /知识产权情况/ }).click();
    await expect(page.getByLabel("授权（申请）项目名称").first()).toHaveValue(
      "旧数据专利",
    );
    await expect(page.getByLabel("授权（申请）项目名称").last()).toHaveValue(
      "新增专利",
    );
    await expect(page.getByLabel("论著名称")).toHaveValue("节能技术论著");
    await page.getByRole("button", { name: /应用及效益/ }).click();
    await expect(page.getByLabel("应用单位名称")).toHaveValue("示范应用单位");
    await expect(page.getByLabel("项目总投资额（万元人民币）")).toHaveValue(
      "200",
    );
    await expect(page.getByLabel("年度")).toHaveValue("2025");
    await page.getByRole("button", { name: /主要完成人/ }).click();
    await expect(page.getByLabel("合作方式")).toHaveValue("共同研发");
    await page.getByRole("button", { name: /主要完成单位/ }).click();
    await expect(page.getByLabel("完成单位列表")).toContainText("甲完成单位");
    await page
      .getByLabel("完成单位列表")
      .getByRole("button", { name: "上移乙完成单位" })
      .click();
    await expect(
      page
        .getByLabel("完成单位列表")
        .locator(".entity-editor__list-item")
        .first(),
    ).toContainText("乙完成单位");
    await expect
      .poll(async () => {
        const response = await page.request.get(
          `${baseUrl}/api/applications/${applicationId}`,
        );
        return (await response.json()).application.data.units?.map(
          ({ name, rank }) => ({ name, rank }),
        );
      })
      .toEqual([
        { name: "乙完成单位", rank: 1 },
        { name: "甲完成单位", rank: 2 },
      ]);
    await page.getByRole("button", { name: /主要完成人/ }).click();

    await page.getByRole("button", { name: "预览当前申报书" }).click();
    await expect(page.getByText("申报书预览", { exact: true })).toBeVisible();
    const basicPreview = page.locator(".preview-basic-page");
    await expect(basicPreview.locator(".preview-date-range-value")).toHaveCount(
      2,
    );
    await expect(
      basicPreview.locator(".preview-date-range-value").first(),
    ).toContainText("起始：年　　月　　日");
    await expect(
      page.getByRole("table", { name: "经济效益数据" }),
    ).toContainText("2025");
    const economicPreview = page.getByRole("table", { name: "经济效益数据" });
    await expect(economicPreview.locator("col")).toHaveCount(6);
    await expect(economicPreview).toContainText("创收外汇（万美元）");
    await expect(economicPreview).toContainText("新增销售额");
    await expect(economicPreview).toContainText("100");
    const awardPreview = page.getByRole("table", {
      name: "四、本项目曾获奖励情况",
    });
    await expect(awardPreview.locator("thead th")).toHaveCount(5);
    await expect(awardPreview).not.toContainText("序号");
    await expect(awardPreview).toContainText("授奖部门（组织）");
    await expect(
      page.getByRole("table", { name: "五、申请、获得知识产权情况表" }),
    ).toContainText("CN-LEGACY-1");
    await expect(
      page
        .getByRole("table", { name: "五、申请、获得知识产权情况表" })
        .locator("thead th"),
    ).toHaveCount(5);
    await expect(
      page.getByLabel("五、技术评价证明及国家法律法规要求的行业审批文件目录"),
    ).toBeVisible();
    await expect(page.getByRole("table", { name: "五、论著" })).toContainText(
      "节能技术论著",
    );
    await expect(
      page.getByRole("table", { name: "五、应用单位目录" }),
    ).toContainText("示范应用单位");
    await expect(
      page.getByRole("table", { name: "五、应用单位目录" }).locator("thead th"),
    ).toHaveCount(7);
    const personPreview = page.getByRole("table", {
      name: "第 1 完成人情况表",
    });
    await expect(
      page.getByRole("table", { name: "第 2 完成人情况表" }),
    ).toContainText("北京市");
    await expect(personPreview).toContainText("同意本人在“主要完成人”中的排序");
    await expect(personPreview).toContainText("本人签名：");
    await expect(personPreview.locator(".preview-signature-line")).toHaveText(
      "本人签名：",
    );
    await expect(
      personPreview.locator(".preview-signature-line span"),
    ).toHaveCount(0);
    await expect(
      personPreview.locator(".preview-declaration-row"),
    ).toContainText("年    月    日");
    await expect(
      page.getByRole("table", { name: "第 1 完成单位情况表" }),
    ).toContainText("单位盖章");
    const unitPreview = page.getByRole("table", {
      name: "第 1 完成单位情况表",
    });
    await expect(unitPreview.locator("tbody > tr")).toHaveCount(6);
    await expect(
      unitPreview.locator(
        ".preview-unit-contribution .preview-stamp-block > div",
      ),
    ).toHaveCount(2);
    await expect(
      unitPreview.locator(".preview-unit-contribution .preview-stamp-block"),
    ).toContainText("单位盖章：");
    await expect(
      unitPreview.locator(".preview-unit-contribution .preview-stamp-block"),
    ).toContainText("年    月    日");
    const overflowingPreviewPages = await page
      .locator(".preview-page")
      .evaluateAll((pages) =>
        pages
          .map((page, index) => ({
            page: index + 1,
            horizontal: page.scrollWidth - page.clientWidth,
            vertical: page.scrollHeight - page.clientHeight,
          }))
          .filter(({ horizontal, vertical }) => horizontal > 1 || vertical > 1),
      );
    expect(overflowingPreviewPages).toEqual([]);
    await page.screenshot({
      path: "test-results/forms-preview-desktop.png",
      fullPage: true,
    });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出系统生成 PDF" }).click();
    const pdfDownload = await downloadPromise;
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/i);
    const pdfStream = await pdfDownload.createReadStream();
    let pdfBytes = 0;
    for await (const chunk of pdfStream) pdfBytes += chunk.length;
    expect(pdfBytes).toBeGreaterThan(10_000);
    await page.getByRole("button", { name: "返回填写" }).click();

    await page.screenshot({
      path: "test-results/forms-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "打开导航" }).click();
    await page.getByRole("button", { name: /知识产权情况/ }).click();
    await page.getByRole("button", { name: "打开导航" }).click();
    await page.getByRole("button", { name: /主要完成人/ }).click();
    await expect(page.locator(".sidebar")).toBeHidden();
    await page.waitForTimeout(350);
    await expect(page.getByLabel("完成人列表")).toBeVisible();
    await expect(page.locator(".entity-editor__details")).toBeHidden();
    const mobilePerson = page
      .getByLabel("完成人列表")
      .locator(".entity-editor__list-item")
      .filter({ hasText: "乙完成人" })
      .locator(".entity-editor__select");
    await mobilePerson.click();
    await expect(page.getByLabel("完成人列表")).toBeHidden();
    await expect(page.locator(".entity-editor__details")).toBeVisible();
    await page.getByRole("button", { name: "返回完成人列表" }).click();
    await expect(page.getByLabel("完成人列表")).toBeVisible();
    await expect(mobilePerson).toBeFocused();

    const undersizedControls = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".entity-editor__list button, .entity-editor__actions button, .discipline-selector__selection button, .structured-table__actions button",
        ),
      ]
        .filter((element) => element.offsetParent !== null)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label"),
            width: rect.width,
            height: rect.height,
          };
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    );
    expect(undersizedControls).toEqual([]);
    await page.getByRole("button", { name: "打开导航" }).click();
    await page.getByRole("button", { name: /知识产权情况/ }).click();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".structured-table__row").first()).toBeVisible();
    await page.waitForTimeout(250);
    expect(
      await page.locator(".sidebar").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.right <= 0 && getComputedStyle(element).visibility === "hidden"
        );
      }),
    ).toBe(true);
    const pageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBe(false);
    await page.screenshot({
      path: "test-results/forms-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    if (applicationId) {
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});
