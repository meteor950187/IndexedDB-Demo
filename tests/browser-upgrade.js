async () => {
  const context=await page.context().browser().newContext();
  const probe=await context.newPage();
  const report={};
  try {
    await context.request.post('http://127.0.0.1:4174/__test/reset');
    await probe.goto('http://127.0.0.1:4174');
    await probe.waitForFunction(()=>!document.getElementById('start-input').disabled,null,{timeout:45000});
    await probe.locator('#shell-status').filter({hasText:'已保存'}).waitFor();
    report.before=await probe.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('TaipeiBusOffline-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const meta=await new Promise(resolve=>{db.transaction('meta').objectStore('meta').get('current').onsuccess=e=>resolve(e.target.result);});
      const version=db.version;db.close();return {version,savedAt:meta.savedAt,caches:await caches.keys()};
    });
    if(report.before.version!==1||!report.before.caches.includes('taipei-bus-shell-v2')) throw new Error('未載入真實舊版基準');
    await context.route('**/blobbus/**',route=>route.abort());
    await context.request.post('http://127.0.0.1:4174/__test/upgrade');
    await probe.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();}).catch(e=>{if(!/context was destroyed/.test(e.message))throw e;});
    await probe.waitForFunction(()=>document.getElementById('start-help')?.textContent.includes('選站名或站區'),null,{timeout:45000});
    await probe.waitForFunction(()=>!document.getElementById('start-input').disabled);
    report.after=await probe.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('TaipeiBusOffline-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const meta=await new Promise(resolve=>{db.transaction('meta').objectStore('meta').get('current').onsuccess=e=>resolve(e.target.result);});
      const version=db.version;db.close();return {version,savedAt:meta.savedAt,modelVersion:meta.modelVersion,caches:await caches.keys()};
    });
    if(report.after.version!==2||report.after.savedAt!==report.before.savedAt) throw new Error('快取未離線遷移或資料儲存時間改變');
    await probe.locator('#tab-routes').click();await probe.locator('#route-input').fill('262');
    await probe.waitForFunction(()=>document.querySelector('.result-summary')?.textContent.includes('「262」'));
    report.routes=await probe.locator('.route-number').allTextContents();
    if(JSON.stringify(report.routes)!==JSON.stringify(['262','262區'])) throw new Error('舊索引未重建');
    await context.setOffline(true);await probe.reload();
    await probe.waitForFunction(()=>!document.getElementById('start-input').disabled);
    await probe.locator('#start-input').fill('智光商職');await probe.locator('#start-list button').first().waitFor();
    if(await probe.locator('#start-list button').count()!==1) throw new Error('離線升級後站群不正確');
    await probe.locator('#start-list button').click();
    await probe.locator('#end-input').fill('台北車站忠孝');await probe.locator('#end-list button').first().waitFor();await probe.locator('#end-list button').click();
    await probe.locator('#search-trips').click();await probe.locator('.route-number').filter({hasText:/^262$/}).waitFor();
    report.offlineAfterUpgrade=true;
    await probe.screenshot({path:'output/playwright/stations-upgrade-offline.png',fullPage:true});
    return report;
  } finally {await context.close();}
}
