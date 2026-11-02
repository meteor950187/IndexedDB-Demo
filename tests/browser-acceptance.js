async () => {
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const probe = await context.newPage();
  const faults = [];
  probe.on('pageerror', error => faults.push(error.message));
  const report = {};
  try {
    await probe.goto('http://127.0.0.1:4173');
    await probe.waitForFunction(() => !document.getElementById('example').disabled, null, { timeout: 45000 });
    await probe.locator('#shell-status').filter({ hasText: '已保存' }).waitFor();
    report.routes = await probe.locator('#route-count').textContent();
    report.stops = await probe.locator('#stop-count').textContent();
    await probe.locator('#example').click();
    await probe.locator('.route-card').first().waitFor();
    if (/裁撤|不停靠|停用/.test(await probe.locator('#end-input').inputValue())) throw new Error('Example selected inactive stop');
    await probe.locator('.route-card summary').first().click();
    await probe.locator('.stop-timeline .board').first().waitFor();
    await probe.locator('.stop-timeline .alight').first().waitFor();
    report.exampleAndTimeline = true;
    await probe.screenshot({ path: 'output/playwright/desktop-final.png', fullPage: true });

    await probe.locator('#reset').click();
    await probe.locator('#start-input').fill('臺北車站');
    await probe.locator('#start-list button').first().waitFor();
    report.stationCandidates = await probe.locator('#start-list button').count();
    await probe.locator('#start-input').press('ArrowDown');
    await probe.keyboard.press('Enter');
    await probe.locator('#search-trips').click();
    await probe.locator('.route-card').first().waitFor();
    report.keyboardSelectionAndSingleStop = true;
    await probe.locator('#tab-routes').click();
    await probe.locator('#route-input').fill('307');
    await probe.locator('.route-number').filter({ hasText: '307' }).first().waitFor();
    report.routeSearch = true;
    await probe.locator('#route-input').fill('不可能存在的路線XYZ');
    await probe.getByRole('heading', { name: '找不到這條路線' }).waitFor();
    report.emptySearch = true;

    await probe.setViewportSize({ width: 390, height: 844 });
    await probe.locator('#tab-stops').click();
    await probe.locator('#example').click();
    await probe.locator('.route-card').first().waitFor();
    const overflow = await probe.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error('Mobile viewport overflows');
    await probe.screenshot({ path: 'output/playwright/mobile-final.png', fullPage: true });
    report.mobile = true;

    await context.setOffline(true);
    await probe.reload();
    await probe.waitForFunction(() => !document.getElementById('example').disabled);
    await probe.locator('#example').click();
    await probe.locator('.route-card').first().waitFor();
    await probe.locator('.route-card summary').first().click();
    await probe.locator('.stop-timeline .board').first().waitFor();
    await probe.screenshot({ path: 'output/playwright/offline-final.png', fullPage: true });
    report.offlineReloadAndQuery = true;
    await context.setOffline(false);
    await probe.waitForFunction(() => !document.getElementById('sync-now').disabled);
    if (faults.length) throw new Error('Browser exceptions: ' + faults.join('; '));
    report.pageErrors = faults.length;
  } finally { await context.close(); }

  const failureContext = await browser.newContext({ serviceWorkers: 'block' });
  const failurePage = await failureContext.newPage();
  try {
    await failureContext.route('**/blobbus/**', route => route.abort());
    await failurePage.goto('http://127.0.0.1:4173');
    await failurePage.locator('#status-text').filter({ hasText: '尚未取得資料' }).waitFor();
    if (!(await failurePage.locator('#start-input').isDisabled())) throw new Error('First failure falsely ready');
    await failureContext.unroute('**/blobbus/**');
    await failurePage.locator('#sync-now').click();
    await failurePage.waitForFunction(() => !document.getElementById('start-input').disabled, null, { timeout: 45000 });
    await failureContext.route('**/blobbus/**', route => route.abort());
    await failurePage.locator('#sync-now').click();
    await failurePage.locator('#status-text').filter({ hasText: '保留既有資料' }).waitFor();
    await failurePage.locator('#example').click();
    await failurePage.locator('.route-card').first().waitFor();
    report.firstFailureRecoveryAndRetainedCache = true;

    // 第二個頁面的 Worker 寫入新版，第一頁必須失效舊結果。
    const second = await failureContext.newPage();
    await second.goto('http://127.0.0.1:4173');
    await second.waitForFunction(() => !document.getElementById('start-input').disabled);
    await second.evaluate(async () => {
      const { openDatabase } = await import('/app/db.js');
      const { BusBridge } = await import('/app/bridge.js');
      const db = await openDatabase();
      const tx = db.transaction(['routes', 'stops', 'routeStops']);
      const all = name => new Promise(resolve => { tx.objectStore(name).getAll().onsuccess = e => resolve(e.target.result); });
      const [routes, stops, rows] = await Promise.all([all('routes'), all('stops'), all('routeStops')]);
      db.close();
      const wrap = BusInfo => 'data:application/json,' + encodeURIComponent(JSON.stringify({ EssentialInfo: { UpdateTime: 'browser cross-tab test' }, BusInfo }));
      const sources = {
        routes: wrap(routes.map(r => ({ Id: r.id, nameZh: r.name + '測試換版', departureZh: r.departure, destinationZh: r.destination, providerName: r.providers[0] }))),
        locations: wrap(stops.map(s => ({ id: s.id, name: s.name, address: s.address, lat: s.lat, lon: s.lon }))),
        stops: wrap(rows.map(r => ({ Id: r.id, routeId: r.routeId, stopLocationId: r.stopId, nameZh: r.name, seqNo: r.seq, goBack: r.direction })))
      };
      const writer = new BusBridge({ sources });
      await writer.sync();
      writer.dispose();
    });
    await failurePage.getByRole('heading', { name: '資料已更新' }).waitFor();
    if (await failurePage.locator('.route-card').count()) throw new Error('Cross-tab change retained stale cards');
    report.crossTabInvalidation = true;
  } finally { await failureContext.close(); }
  return report;
}
