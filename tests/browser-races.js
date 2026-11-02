async () => {
  const context = await page.context().browser().newContext({ serviceWorkers: 'block' });
  const probe = await context.newPage();
  try {
    await probe.goto('http://127.0.0.1:4173');
    await probe.waitForFunction(() => !document.getElementById('example').disabled, null, { timeout: 45000 });
    await probe.evaluate(async () => {
      const { BusBridge } = await import('/app/bridge.js');
      const original = BusBridge.prototype.query;
      BusBridge.prototype.query = async function(method, ...args) {
        const result = await original.call(this, method, ...args);
        if (window.delayMethod === method) {
          window.delayMethod = null;
          await new Promise(resolve => { window.releaseQuery = resolve; });
        }
        return result;
      };
      window.delayMethod = 'searchRoutes';
    });
    await probe.locator('#example').click();
    await probe.waitForFunction(() => typeof window.releaseQuery === 'function');
    await probe.locator('#reset').click();
    await probe.evaluate(() => { window.releaseQuery(); window.releaseQuery = null; });
    await probe.waitForTimeout(400);
    if (await probe.locator('#start-input').inputValue()) throw new Error('Cancelled example overwrote cleared selection');

    await probe.evaluate(() => { window.delayMethod = 'trips'; });
    await probe.locator('#example').click();
    await probe.waitForFunction(() => typeof window.releaseQuery === 'function');
    await probe.locator('#start-input').fill('台北');
    await probe.evaluate(() => { window.releaseQuery(); window.releaseQuery = null; });
    await probe.waitForTimeout(400);
    if (await probe.locator('.route-card').count()) throw new Error('Outdated trip rendered after input changed');
    return { cancelledExample: true, staleTrip: true };
  } finally { await context.close(); }
}
