import { expect, test } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

function entityList(page, label) {
  return page.getByLabel(label).locator(".entity-editor__list-item");
}

async function expectEntityOrder(page, label, names) {
  const rows = entityList(page, label);
  await expect(rows).toHaveCount(names.length);
  await expect
    .poll(async () =>
      rows.locator(".entity-editor__select span").allTextContents(),
    )
    .toEqual(names);
}

async function expectDisciplineOrder(page, names) {
  const rows = page.getByLabel("已选学科").locator("li");
  await expect(rows).toHaveCount(names.length);
  const text = await rows.locator(":scope > span").allTextContents();
  expect(
    text.map((value) => names.find((name) => value.includes(name))),
  ).toEqual(names);
}

async function touchDrag(page, source, target) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).toBeTruthy();
  expect(targetBox).toBeTruthy();
  const from = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const to = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...from, id: 1 }],
  });
  for (let step = 1; step <= 5; step += 1) {
    const ratio = step / 5;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
          id: 1,
        },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

test("people, units and disciplines support mouse, touch, keyboard and confirmed deletion", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const title = `排序交互验收-${suffix}`;
  let applicationId;

  const register = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username: `reorder${suffix}`,
      email: `reorder${suffix}@example.test`,
      displayName: "排序验收用户",
      password: `Reorder-${suffix}`,
    },
  });
  expect(register.ok(), await register.text()).toBe(true);

  const create = await page.request.post(`${baseUrl}/api/applications`, {
    data: {
      title,
      year: 2026,
      awardType: "节能减排科技进步奖",
      workflowMode: "form",
    },
  });
  expect(create.ok(), await create.text()).toBe(true);
  applicationId = (await create.json()).application.id;

  try {
    const seed = await page.request.put(
      `${baseUrl}/api/applications/${applicationId}`,
      {
        data: {
          data: {
            projectName: title,
            people: ["人员甲", "人员乙", "人员丙"].map((name, index) => ({
              id: `person-${index + 1}`,
              name,
              rank: index + 1,
            })),
            units: ["单位甲", "单位乙", "单位丙"].map((name, index) => ({
              id: `unit-${index + 1}`,
              name,
              rank: index + 1,
            })),
            disciplines: [
              ["4806010", "煤炭能"],
              ["4806020", "石油、天然气能"],
              ["4806030", "水能"],
            ].map(([code, name]) => ({
              id: `discipline-${code}`,
              code,
              name,
              level: 3,
              parentCode: "48060",
              path: ["480", "48060", code],
              status: "confirmed",
            })),
          },
        },
      },
    );
    expect(seed.ok(), await seed.text()).toBe(true);

    await page.goto(baseUrl);
    await page.getByRole("button", { name: title, exact: true }).click();

    await page.getByRole("button", { name: /^1 基本情况$/ }).click();
    const peopleTags = page
      .getByLabel("主要完成人排序列表")
      .locator(".entry-tag");
    const unitTags = page
      .getByLabel("主要完成单位排序列表")
      .locator(".entry-tag");
    await peopleTags.getByRole("button", { name: "下移人员甲" }).click();
    await expect(peopleTags.locator(".entry-tag__name")).toHaveText([
      "人员乙",
      "人员甲",
      "人员丙",
    ]);
    await peopleTags.getByRole("button", { name: "上移人员甲" }).click();
    await unitTags.getByRole("button", { name: "下移单位甲" }).click();
    await expect(unitTags.locator(".entry-tag__name")).toHaveText([
      "单位乙",
      "单位甲",
      "单位丙",
    ]);
    await unitTags.getByRole("button", { name: "上移单位甲" }).click();

    await page.getByRole("button", { name: /主要完成人/ }).click();
    let rows = entityList(page, "完成人列表");
    await rows.nth(0).locator(".entity-editor__drag").dragTo(rows.nth(2));
    await expectEntityOrder(page, "完成人列表", ["人员乙", "人员丙", "人员甲"]);
    rows = entityList(page, "完成人列表");
    await touchDrag(
      page,
      rows.nth(2).locator(".entity-editor__drag"),
      rows.nth(0),
    );
    await expectEntityOrder(page, "完成人列表", ["人员甲", "人员乙", "人员丙"]);
    await rows
      .filter({ hasText: "人员丙" })
      .locator(".entity-editor__drag")
      .press("Alt+ArrowUp");
    await expectEntityOrder(page, "完成人列表", ["人员甲", "人员丙", "人员乙"]);
    await page
      .getByLabel("完成人列表")
      .getByRole("button", { name: "下移人员甲" })
      .click();
    await expectEntityOrder(page, "完成人列表", ["人员丙", "人员甲", "人员乙"]);
    const deletePerson = page
      .getByLabel("完成人列表")
      .getByRole("button", { name: "删除人员甲" });
    await deletePerson.click();
    const personDialog = page.getByRole("alertdialog", { name: "确认删除" });
    const cancelRemoval = personDialog.getByRole("button", { name: "取消" });
    const confirmRemoval = personDialog.getByRole("button", {
      name: "确认删除",
    });
    await expect(personDialog).toBeVisible();
    await expect(cancelRemoval).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirmRemoval).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelRemoval).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(personDialog).toBeHidden();
    await expect(deletePerson).toBeFocused();
    await deletePerson.click();
    await cancelRemoval.click();
    await expectEntityOrder(page, "完成人列表", ["人员丙", "人员甲", "人员乙"]);

    await page.getByRole("button", { name: /主要完成单位/ }).click();
    rows = entityList(page, "完成单位列表");
    await rows.nth(0).locator(".entity-editor__drag").dragTo(rows.nth(2));
    await expectEntityOrder(page, "完成单位列表", [
      "单位乙",
      "单位丙",
      "单位甲",
    ]);
    rows = entityList(page, "完成单位列表");
    await touchDrag(
      page,
      rows.nth(2).locator(".entity-editor__drag"),
      rows.nth(0),
    );
    await expectEntityOrder(page, "完成单位列表", [
      "单位甲",
      "单位乙",
      "单位丙",
    ]);
    await rows
      .filter({ hasText: "单位丙" })
      .locator(".entity-editor__drag")
      .press("Alt+ArrowUp");
    await expectEntityOrder(page, "完成单位列表", [
      "单位甲",
      "单位丙",
      "单位乙",
    ]);
    await page
      .getByLabel("完成单位列表")
      .getByRole("button", { name: "下移单位甲" })
      .click();
    await expectEntityOrder(page, "完成单位列表", [
      "单位丙",
      "单位甲",
      "单位乙",
    ]);

    await page.getByRole("button", { name: /^1 基本情况$/ }).click();
    let disciplines = page.getByLabel("已选学科").locator("li");
    await disciplines
      .nth(0)
      .locator(".discipline-selector__drag")
      .dragTo(disciplines.nth(2));
    await expectDisciplineOrder(page, ["石油、天然气能", "水能", "煤炭能"]);
    disciplines = page.getByLabel("已选学科").locator("li");
    await touchDrag(
      page,
      disciplines.nth(2).locator(".discipline-selector__drag"),
      disciplines.nth(0),
    );
    await expectDisciplineOrder(page, ["煤炭能", "石油、天然气能", "水能"]);
    await disciplines
      .filter({ hasText: "水能" })
      .locator(".discipline-selector__drag")
      .press("Alt+ArrowUp");
    await expectDisciplineOrder(page, ["煤炭能", "水能", "石油、天然气能"]);
    await page.getByRole("button", { name: "下移煤炭能" }).click();
    await expectDisciplineOrder(page, ["水能", "煤炭能", "石油、天然气能"]);
    await page.getByRole("button", { name: "删除煤炭能" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "确认删除" }),
    ).toContainText("煤炭能");
    await page.getByRole("button", { name: "确认删除" }).click();
    await expectDisciplineOrder(page, ["水能", "石油、天然气能"]);

    await expect
      .poll(async () => {
        const response = await page.request.get(
          `${baseUrl}/api/applications/${applicationId}`,
        );
        return (await response.json()).application.data.disciplines?.map(
          ({ name }) => name,
        );
      })
      .toEqual(["水能", "石油、天然气能"]);

    await page.reload();
    await page.getByRole("button", { name: /主要完成人/ }).click();
    await expectEntityOrder(page, "完成人列表", ["人员丙", "人员甲", "人员乙"]);
    await page.getByRole("button", { name: /主要完成单位/ }).click();
    await expectEntityOrder(page, "完成单位列表", [
      "单位丙",
      "单位甲",
      "单位乙",
    ]);
    await page.getByRole("button", { name: /^1 基本情况$/ }).click();
    await expectDisciplineOrder(page, ["水能", "石油、天然气能"]);
  } finally {
    if (applicationId) {
      await page.request.delete(
        `${baseUrl}/api/applications/${applicationId}`,
        {
          timeout: 5_000,
        },
      );
    }
  }
});
