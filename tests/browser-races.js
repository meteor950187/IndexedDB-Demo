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

    await probe.evaluate(() => { window.delayMethod = 'groupTrips'; });
    await probe.locator('#example').click();
    await probe.waitForFunction(() => typeof window.releaseQuery === 'function');
    await probe.locator('#start-input').fill('台北');
    await probe.evaluate(() => { window.releaseQuery(); window.releaseQuery = null; });
    await probe.waitForTimeout(400);
    if (await probe.locator('.route-card').count()) throw new Error('Outdated trip rendered after input changed');

    await probe.locator('#example').click();
    await probe.locator('.route-card').first().waitFor();
    const previousEnd = await probe.locator('#end-input').inputValue();
    await probe.evaluate(() => { window.delayMethod = 'groupTrips'; });
    await probe.locator('#search-trips').click();
    await probe.waitForFunction(() => typeof window.releaseQuery === 'function');
    await probe.locator('#swap').click();
    await probe.evaluate(() => { window.releaseQuery(); window.releaseQuery = null; });
    await probe.waitForTimeout(200);
    if (await probe.locator('.route-card').count()) throw new Error('Outdated forward trip rendered after swap');
    if (await probe.locator('#start-input').inputValue() !== previousEnd) throw new Error('Swap lost selection');

    await probe.locator('#reset').click();
    await probe.evaluate(() => { window.delayMethod = 'searchStations'; });
    await probe.locator('#start-input').fill('台北');
    await probe.waitForFunction(() => typeof window.releaseQuery === 'function');
    await probe.locator('#start-input').fill('智光商職');
    await probe.locator('#start-list button strong').filter({hasText: /^智光商職$/}).waitFor();
    await probe.evaluate(() => { window.releaseQuery(); window.releaseQuery = null; });
    await probe.waitForTimeout(200);
    if (await probe.locator('#start-list button').count() !== 1) throw new Error('Older station candidates replaced newer input');
    await probe.evaluate(() => { window.delayMethod = 'searchStations'; });
    await probe.locator('#start-input').fill('台北車站');
    await probe.waitForFunction(() => typeof window.releaseQuery === 'function');
    await probe.locator('#tab-routes').click();
    await probe.evaluate(() => { window.releaseQuery(); window.releaseQuery = null; });
    await probe.waitForTimeout(200);
    if (!(await probe.locator('#start-list').isHidden())) throw new Error('Stale candidates reopened after mode switch');

    await probe.evaluate(() => { window.delayMethod = 'searchRoutes'; });
    await probe.locator('#route-input').fill('26');
    await probe.waitForFunction(() => typeof window.releaseQuery === 'function');
    await probe.locator('#route-input').fill('262');
    await probe.waitForFunction(() => document.querySelector('.result-summary')?.textContent.includes('「262」'));
    await probe.evaluate(() => { window.releaseQuery(); window.releaseQuery = null; });
    await probe.waitForTimeout(200);
    if (JSON.stringify(await probe.locator('.route-number').allTextContents()) !== JSON.stringify(['262','262區'])) throw new Error('Older route query replaced newer input');
    await probe.locator('#route-input').fill('');
    if (await probe.locator('.route-card').count()) throw new Error('Clearing route query retained old cards');
    await probe.locator('#tab-stops').click();
    await probe.locator('#example').click();
    await probe.locator('.route-card').first().waitFor();
    await probe.evaluate(async()=>{
      const {BusBridge}=await import('/app/bridge.js');
      const original=BusBridge.prototype.query;
      BusBridge.prototype.query=function(method,...args) {
        if(method==='groupTrips') return new Promise((resolve,reject)=>{window.rejectQuery=()=>reject(new Error('過時錯誤'));});
        return original.call(this,method,...args);
      };
    });
    await probe.locator('#search-trips').click();
    await probe.waitForFunction(()=>typeof window.rejectQuery==='function');
    await probe.locator('#reset').click();
    await probe.evaluate(()=>window.rejectQuery());
    await probe.waitForTimeout(200);
    if(await probe.locator('#form-message').textContent()) throw new Error('Outdated failure overwrote current form');
    return { cancelledExample: true, staleTrip: true, swap: true, rapidStations: true, modeSwitch: true, rapidRoutes: true, clearRoute: true, staleError: true };
  } finally { await context.close(); }
}
