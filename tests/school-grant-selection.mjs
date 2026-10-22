import assert from 'node:assert/strict';

export async function settleGrantOverlay(locator) {
  await locator.evaluate(async element => {
    const finite = element.getAnimations({subtree: true})
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
  });
}

export async function assertGrantSelected(page, modal, label, expected) {
  const input = modal.getByLabel(label, {exact: true});
  const id = await input.getAttribute('id');
  await page.waitForFunction(({id, expected}) => {
    const input = document.getElementById(id);
    return input?.getAttribute('aria-expanded') === 'false'
      && input.parentElement.getAttribute('title') === expected;
  }, {id, expected});
  assert.equal(await input.locator('..').getAttribute('title'), expected);
}

export async function chooseGrantOption(page, modal, label, expected) {
  const input = modal.getByLabel(label, {exact: true});
  await settleGrantOverlay(modal);
  await input.click();
  const listId = await input.getAttribute('aria-controls');
  assert.ok(listId, label + '必须展开对应下拉列表');
  const popup = page.locator('.ant-select-dropdown').filter({has: page.locator('[id="' + listId + '"]')});
  await settleGrantOverlay(popup);
  // Scope to this combobox's popup; never force-click, inject form values or retry selection.
  const option = popup.locator('.ant-select-item-option-content').getByText(expected, {exact: true});
  await option.hover();
  await settleGrantOverlay(option.locator('..'));
  await option.click();
  await assertGrantSelected(page, modal, label, expected);
}
