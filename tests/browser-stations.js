async () => {
  const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});
  const probe=await context.newPage();
  const errors=[];probe.on('pageerror',e=>errors.push(e.message));
  const report={};
  async function choose(which,text,official) {
    await probe.locator(`#${which}-input`).fill(text);
    const candidate=probe.locator(`#${which}-list button`).filter({has:probe.locator('strong',{hasText:official})});
    await candidate.waitFor();await candidate.click();
  }
  async function waitResult(from) {
    await probe.waitForFunction(name=>document.querySelector('.result-summary')?.textContent.startsWith(name),from);
  }
  try {
    await probe.goto('http://127.0.0.1:4173');
    await probe.waitForFunction(()=>!document.getElementById('start-input').disabled,null,{timeout:45000});
    await probe.locator('#shell-status').filter({hasText:'已保存'}).waitFor();
    await probe.locator('#start-input').fill('志光商職');
    await probe.locator('.suggestion').waitFor();
    if(await probe.locator('#start-list button').count()!==1) throw new Error('智光商職未合併為單一站群');
    report.suggestion=await probe.locator('.suggestion').innerText();
    await probe.locator('#start-list button').click();
    await probe.locator('#end-input').fill('台北車站');
    await probe.locator('#end-list .station-hub').waitFor();
    report.taipeiChoices=await probe.locator('#end-list button strong').allTextContents();
    await probe.screenshot({path:'output/playwright/station-choices.png',fullPage:true});
    await probe.locator('#end-list button').filter({has:probe.locator('strong',{hasText:'臺北車站(忠孝)'})}).click();
    await probe.locator('#search-trips').click();await waitResult('智光商職');
    report.forwardRoutes=await probe.locator('.route-number').allTextContents();
    if(!report.forwardRoutes.includes('262')||!report.forwardRoutes.includes('262區')) throw new Error('正向未找到262與262區');
    const route262=probe.locator('.route-card').filter({has:probe.locator('.route-number',{hasText:/^262$/})});
    report.forward=await route262.locator('.boarding-point').evaluateAll(nodes=>nodes.map(n=>({stopId:n.dataset.stopId,seq:Number(n.dataset.seq),text:n.innerText,map:n.querySelector('a')?.href})));
    if(report.forward[0].stopId!=='72406'||report.forward[1].stopId!=='1882'||report.forward[0].seq>=report.forward[1].seq) throw new Error('262正向站位或站序不符本次官方資料');
    if(!report.forward.every(p=>p.map?.includes('maps/search/?api=1&query='))) throw new Error('定位連結缺少官方座標');
    await route262.locator('summary').click();await route262.locator('.board').waitFor();await route262.locator('.alight').waitFor();
    await probe.screenshot({path:'output/playwright/stations-desktop.png',fullPage:true});
    await probe.locator('#swap').click();await probe.locator('#search-trips').click();await waitResult('臺北車站');
    report.reverse=await route262.locator('.boarding-point').evaluateAll(nodes=>nodes.map(n=>({stopId:n.dataset.stopId,seq:Number(n.dataset.seq),text:n.innerText})));
    if(report.reverse[0].stopId!=='1000082'||report.reverse[1].stopId!=='3037'||report.reverse[0].seq>=report.reverse[1].seq) throw new Error('交換後未重新選擇反向站位');

    await probe.locator('#tab-routes').click();
    report.routeSearch={};
    for(const number of ['262','26','226']) {
      await probe.locator('#route-input').fill(number);
      await probe.waitForFunction(n=>document.querySelector('.result-summary')?.textContent.includes(`「${n}」`),number);
      report.routeSearch[number]=await probe.locator('.route-number').allTextContents();
    }
    if(JSON.stringify(report.routeSearch['262'])!==JSON.stringify(['262','262區'])) throw new Error('262搜尋誤命中或排序錯誤');
    if(report.routeSearch['26'][0]!=='26'||report.routeSearch['226'][0]!=='226') throw new Error('完全相符未優先');
    await probe.locator('#route-input').fill('262');
    await probe.waitForFunction(()=>document.querySelector('.result-summary')?.textContent.includes('「262」'));
    await route262.locator('.direction-select').selectOption('1');
    await route262.locator('summary').click();await route262.locator('.stop-timeline li').first().waitFor();
    report.directionSwitch=true;

    await probe.locator('#tab-stops').click();await probe.locator('#reset').click();
    await choose('start','公館','捷運公館站');
    await choose('end','台北車站忠孝','臺北車站(忠孝)');
    await probe.locator('#search-trips').click();await waitResult('捷運公館站');
    report.secondPair=await probe.locator('.route-number').allTextContents();
    if(!report.secondPair.length) throw new Error('第二組行程無結果');

    await choose('start','智光商職','智光商職');
    await probe.locator('#search-trips').click();await waitResult('智光商職');
    await probe.setViewportSize({width:390,height:844});
    if(await probe.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('手機水平溢出');
    await probe.screenshot({path:'output/playwright/stations-mobile.png',fullPage:true});
    await context.setOffline(true);await probe.reload();
    await probe.waitForFunction(()=>!document.getElementById('start-input').disabled);
    await choose('start','智光商職','智光商職');await choose('end','台北車站忠孝','臺北車站(忠孝)');
    await probe.locator('#search-trips').click();await waitResult('智光商職');
    if(!(await probe.locator('.route-number').allTextContents()).includes('262')) throw new Error('離線站群查詢失敗');
    report.offline=true;
    if(errors.length) throw new Error(errors.join(';'));
    report.pageErrors=errors.length;
    return report;
  } finally {await context.close();}
}
