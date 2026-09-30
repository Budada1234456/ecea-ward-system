import { expect, test } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

test("award dropdowns show placeholders for empty values and persist selections", async ({
  page,
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `industry${suffix}`;
  const applicationIds = [];

  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "行业选择验收用户",
      password: `Industry-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);

  try {
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "新建申报材料" }).click();
    const createChannel = page.locator(".create-dialog select").nth(1);
    await expect(createChannel).toHaveValue("");
    await expect(createChannel.locator("option:checked")).toHaveText("请选择");
    const dialog = page.locator(".create-dialog");
    const dialogTitle = `创建渠道验收-${suffix}`;
    await dialog.locator("input.control").fill("测试申报单位");
    await dialog.locator("textarea").fill(dialogTitle);
    await dialog.getByRole("button", { name: "创建申报材料" }).click();
    await expect(dialog).toContainText("请选择申报渠道");
    await createChannel.selectOption("行业、地方节能相关协会推荐");
    await dialog.getByRole("button", { name: "创建申报材料" }).click();
    await expect(
      page.getByRole("heading", { name: "项目基本情况" }),
    ).toBeVisible();
    const createdList = await page.request.get(
      `${baseUrl}/api/applications?keyword=${encodeURIComponent(dialogTitle)}`,
    );
    const createdId = (await createdList.json()).list[0].id;
    applicationIds.push(createdId);
    const createdDetail = await page.request.get(
      `${baseUrl}/api/applications/${createdId}`,
    );
    expect(
      (await createdDetail.json()).application.data.applicationChannel,
    ).toBe("行业、地方节能相关协会推荐");

    for (const awardType of [
      "节能减排科技成就奖",
      "节能减排科技进步奖",
      "节能减排技术发明奖",
    ]) {
      const title = `${awardType}-${suffix}`;
      const creation = await page.request.post(`${baseUrl}/api/applications`, {
        data: { title, year: 2026, awardType, workflowMode: "form" },
      });
      expect(creation.ok(), await creation.text()).toBe(true);
      const applicationId = (await creation.json()).application.id;
      applicationIds.push(applicationId);
      const clearDropdowns = await page.request.put(
        `${baseUrl}/api/applications/${applicationId}`,
        {
          data: { data: { applicationChannel: "", year: "" } },
        },
      );
      expect(clearDropdowns.ok(), await clearDropdowns.text()).toBe(true);

      await page.goto(baseUrl);
      await page.getByRole("button", { name: title, exact: true }).click();
      const field = (label) =>
        page.locator(".field-row", { hasText: label }).locator("select");
      const channel = field("申报渠道");
      const year = field("申报年度");
      await expect(channel).toHaveValue("");
      await expect(channel.locator("option:checked")).toHaveText("请选择");
      await expect(year).toHaveValue("");
      await expect(year.locator("option:checked")).toHaveText("请选择");
      await channel.selectOption("科研院所、高等院校推荐");
      await year.selectOption("2025");

      if (awardType !== "节能减排科技成就奖") {
        const industry = page
          .locator(".field-row", {
            hasText: "所属国民经济行业",
          })
          .locator("select");
        await expect(industry).toHaveValue("");
        await expect(industry.locator("option:checked")).toHaveText("请选择");

        await industry.selectOption("A");
        await expect(industry).toHaveValue("A");
      }
      await page.getByRole("button", { name: "保存草稿" }).click();
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${baseUrl}/api/applications/${applicationId}`,
          );
          const data = (await response.json()).application.data;
          return {
            channel: data.applicationChannel,
            year: data.year,
            industry: data.industry || "",
          };
        })
        .toEqual({
          channel: "科研院所、高等院校推荐",
          year: "2025",
          industry: awardType === "节能减排科技成就奖" ? "" : "A",
        });

      await page.reload();
      await expect(channel).toHaveValue("科研院所、高等院校推荐");
      await expect(year).toHaveValue("2025");
      if (awardType !== "节能减排科技成就奖") {
        await expect(field("所属国民经济行业")).toHaveValue("A");
      }
    }
  } finally {
    for (const applicationId of applicationIds) {
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});
