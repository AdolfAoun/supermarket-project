import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Called only by the verified disposable-MySQL integration fixture. This proxy
// may forward writes, so it explicitly refuses the owner's ordinary API port.
export async function runPrivateBrowser(api: string, setSplitFixture?: (enabled: boolean) => Promise<void>) {
  const target = new URL(api);
  assert.equal(target.hostname, '127.0.0.1'); assert.notEqual(target.port, '3000'); assert.ok(target.port);
  const root = path.resolve('dist/web'); assert.ok(fs.existsSync(path.join(root, 'index.html')));
  let itemGate: Promise<void> | undefined, releaseItem = () => {}, failNextAddition = false, additionRequests = 0, detailReads = 0;
  let itemWrites = 0;
  let failNextOptimization = false;
  let noPriceCoverage = false;
  let discoveryRequests = 0, failNextDiscovery = false;
  let discoveryCoverage: 'partial' | 'empty' | null = null;
  const optimizationQueries: string[] = [];
  function holdItemRequest() { itemGate = new Promise<void>(resolve => { releaseItem = () => { itemGate = undefined; resolve(); }; }); }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        if (req.method === 'POST' && url.pathname === '/api/journeys/supermarkets') {
          discoveryRequests++;
          if (failNextDiscovery) { failNextDiscovery = false; res.writeHead(503).end('Controlled routing outage'); return; }
        }
        if (req.method === 'GET' && url.pathname.endsWith('/optimization')) {
          optimizationQueries.push(url.search);
          if (failNextOptimization) { failNextOptimization = false; res.writeHead(500).end('Controlled T04 failure'); return; }
        }
        if ((req.method === 'PATCH' || req.method === 'DELETE') && url.pathname.includes('/items/')) itemWrites++;
        if (req.method === 'GET' && /^\/api\/shopping-lists\/\d+$/.test(url.pathname)) detailReads++;
        if (req.method === 'POST' && url.pathname.endsWith('/items')) {
          additionRequests++;
          if (failNextAddition) { failNextAddition = false; res.writeHead(500).end('Private test failure'); return; }
        }
        if ((req.method === 'PATCH' || req.method === 'POST' || req.method === 'DELETE') && url.pathname.includes('/items') && itemGate) await itemGate;
        const response = await fetch(`${api}${url.pathname.slice(4)}${url.search}`, { method: req.method,
          headers: { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
          ...(body.length ? { body } : {}) });
        let responseText = await response.text();
        if (discoveryCoverage && response.ok && url.pathname === '/api/journeys/supermarkets') {
          const result = JSON.parse(responseText);
          result.evaluationComplete = false;
          result.exclusions.push({ branchId: 1081, reason: 'routing_unavailable' });
          if (discoveryCoverage === 'empty') result.options = [];
          responseText = JSON.stringify(result);
        }
        // Explicit UI-only no-coverage response fixture. Normal/split flows use
        // real SQL; this controlled response verifies the rendered empty state.
        if (noPriceCoverage && response.ok && url.pathname.endsWith('/optimization')) {
          const result = JSON.parse(responseText), comparison = result.comparison;
          const missingProductIds = comparison.shoppingList.items.map((i: { productId: number }) => i.productId);
          comparison.incompleteBranches = [...comparison.eligibleBranches, ...comparison.incompleteBranches]
            .map(({ branchId, branch, supermarketId, supermarket }: { branchId: number; branch: string; supermarketId: number; supermarket: string }) =>
              ({ branchId, branch, supermarketId, supermarket, missingProductIds })).sort((a, b) => a.branchId - b.branchId);
          comparison.eligibleBranches = []; comparison.cheapestBranchIds = []; comparison.outcome = 'no_complete_branches';
          result.multiStore = { status: 'no_solution', solution: null, savings: null }; result.missingProductIds = missingProductIds;
          responseText = JSON.stringify(result);
        }
        res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(responseText); return;
      }
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const selected = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
      const type: Record<string, string> = { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': type[path.extname(selected)] ?? 'application/octet-stream' }); fs.createReadStream(selected).pipe(res);
    } catch { res.writeHead(502).end('Test proxy unavailable'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 't03c-browser-'));
  const chrome = spawn(process.env.BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--no-default-browser-check',
      '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const closed = once(chrome, 'close'); let socket: WebSocket | undefined;
  let call!: (method: string, params?: object) => Promise<any>;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort'), started = Date.now();
    while (!fs.existsSync(portFile)) {
      assert.ok(Date.now() - started < 15000, 'Chrome startup timed out'); await new Promise(resolve => setTimeout(resolve, 50));
    }
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    socket = new WebSocket(pages.find(p => p.type === 'page')!.webSocketDebuggerUrl); await once(socket, 'open');
    let sequence = 0; const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    const errors: string[] = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) { const task = pending.get(message.id); pending.delete(message.id);
        if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result); }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    });
    call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket!.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression: string) => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, 'Browser evaluation failed'); return result.result.value;
    };
    const wait = async (expression: string) => {
      const start = Date.now();
      while (!await evaluate(expression)) {
        if (Date.now() - start > 15000) throw new Error(`Browser condition failed: ${expression}; page: ${await evaluate('document.body.innerText.slice(0, 1600)')}`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    const text = (value: string) => `document.body.innerText.toLowerCase().includes(${JSON.stringify(value.toLowerCase())})`;
    const element = (label: string) => `Array.from(document.querySelectorAll('[role="button"],button,a,[role="tab"]')).find(e => e.getClientRects().length && !e.closest('[aria-hidden="true"],[inert]') && (e.getAttribute('aria-label') === ${JSON.stringify(label)} || e.textContent.trim().toLowerCase() === ${JSON.stringify(label.toLowerCase())}))`;
    const click = async (label: string, twice = false) => {
      await wait(`!!(${element(label)}) && !(${element(label)}).disabled && (${element(label)}).getAttribute('aria-disabled') !== 'true'`);
      await evaluate(`(() => {const e=${element(label)}; e.click(); ${twice ? 'e.click();' : ''}})()`);
    };
    const fill = async (label: string, value: string) => {
      const selector = JSON.stringify(`input[aria-label="${label}"]`);
      const input = `Array.from(document.querySelectorAll(${selector})).find(e => e.getClientRects().length && !e.closest('[aria-hidden="true"],[inert]') && !e.disabled)`;
      await wait(`!!(${input})`);
      await evaluate(`(() => { const e=${input}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `const originalFetch=window.fetch.bind(window); window.fetch=(input,options)=>{ const url=new URL(String(input),location.href); return originalFetch(url.pathname.startsWith('/api/')?location.origin+url.pathname+url.search:input,options); };` });
    await call('Page.navigate', { url: origin + '/profile' }); await wait(text('Create an account'));
    await click('Create an account'); await fill('Display name', 'Browser Demo'); await fill('Email', 'browser@example.com'); await fill('Password', 'password123');
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Password"]').type`), 'password');
    await click('Register'); await wait(text('Account created.'));
    await fill('Password', 'password123'); await click('Log in'); await wait(text('My shopping lists'));
    // Prove discovery before the account has ever created a shopping list.
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e=>e.textContent.includes('Home')).click()`); await wait(text('Supermarkets Along My Route'));
    await click('Supermarkets Along My Route'); await wait(text('Find Supermarkets Along Your Route'));
    await fill('Paste Journey Link', 'https://www.google.com/maps/dir/?api=1&origin=33.9808,35.6389&destination=33.8938,35.5018&travelmode=driving');
    await click('Import Route'); await wait(text('Supermarkets Along Your Route')); await wait(text('choose a list for basket comparison'));
    assert.equal(optimizationQueries.length, 0, 'Account without lists can discover without T04');
    await click('Optional saved-list prices'); await click('Choose a saved list'); await wait(text('You have no saved lists'));
    await click('Go back'); await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e=>e.textContent.includes('Shopping List')).click()`); await wait(text('No shopping lists yet.'));
    await fill('Create list', 'Browser basket'); await click('Create list'); await wait(text('This shopping list is empty.'));
    await fill('Rename list', 'Browser acceptance'); await click('Rename list'); await wait(text('Browser acceptance'));
    await click('Add products'); await fill('Search products to add', 'Coke 1.5L'); await fill('Quantity to add', '2');
    await wait(text('Coca-Cola')); holdItemRequest();
    await click('Add Coca-Cola', true); await wait(`(${element('Add Coca-Cola')})?.getAttribute('aria-disabled') === 'true'`);
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="Adding Coca-Cola"]')`), false);
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="product-add-confirmation"]')`), false);
    releaseItem(); await wait(text('Saved in this list: 2 packages'));
    await wait(text('✓ Coca-Cola added to Browser acceptance')); assert.equal(additionRequests, 1);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-testid="product-add-confirmation"]')).pointerEvents`), 'none');
    await wait(`!document.querySelector('[data-testid="product-add-confirmation"]')`);
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Search products to add"]').value`), 'Coke 1.5L');
    failNextAddition = true; await click('Add Coca-Cola'); await wait(text('The backend could not complete'));
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="product-add-confirmation"]')`), false);
    await wait(text('Saved in this list: 2 packages'));
    await fill('Quantity to add', '3'); await click('Add Coca-Cola'); await wait(text('Saved in this list: 5 packages'));
    await click('Go back'); await wait(text('Saved quantity: 5 complete packages'));
    await fill('Quantity for Coca-Cola', '2'); await click('Save quantity'); await wait(text('Saved quantity: 2 complete packages'));
    await click('Add products'); await fill('Search products to add', 'Master'); await fill('Quantity to add', '1');
    await click('Add Master Potato Chips, Salted, 90 g'); await wait(text('Saved in this list: 1 packages')); await click('Go back');
    await wait(text('Saved quantity: 1 complete packages'));
    const listScreenshot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve('dist/ui-shopping-list.png'), Buffer.from(listScreenshot.data, 'base64'));
    const listNode = `Array.from(document.querySelectorAll('[data-testid="shopping-list-scroll"]')).find(e => e.getClientRects().length && !e.closest('[aria-hidden="true"],[inert]'))`;
    await evaluate(`(() => {window.__uxScroll=${listNode}; window.__uxRow=window.__uxScroll.querySelector('[data-testid^="list-item-"]'); window.__uxScroll.scrollTop=100; window.__uxTop=window.__uxScroll.scrollTop;})()`);
    assert.ok(await evaluate('window.__uxTop > 0'));
    const readsBeforeQuantityChange = detailReads;
    await evaluate(`(() => {window.__uxOther=window.__uxScroll.querySelectorAll('[data-testid^="list-item-"]')[1]; window.__uxOtherChanges=[];
      window.__uxOtherObserver=new MutationObserver(records=>window.__uxOtherChanges.push(...records));
      window.__uxOtherObserver.observe(window.__uxOther,{subtree:true,childList:true,characterData:true});})()`);
    holdItemRequest(); await click('Increase Coca-Cola quantity'); await wait(`(${element('Increase Coca-Cola quantity')})?.getAttribute('aria-disabled') === 'true'`);
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="Saving Coca-Cola"]')`), false);
    assert.equal(await evaluate(`window.__uxScroll === (${listNode}) && window.__uxScroll.contains(window.__uxRow)`), true);
    assert.equal(await evaluate('window.__uxScroll.scrollTop === window.__uxTop'), true);
    assert.equal(await evaluate(`window.__uxScroll.querySelector('input[aria-label="Quantity for Potato Chips"]').disabled`), false);
    assert.equal(await evaluate(`window.__uxScroll.innerText.includes('Saved quantity: 2 complete packages')`), true);
    releaseItem(); await wait(text('Saved quantity: 3 complete packages'));
    assert.equal(await evaluate(`window.__uxScroll === (${listNode}) && window.__uxScroll.contains(window.__uxRow)`), true);
    assert.equal(await evaluate('window.__uxScroll.scrollTop === window.__uxTop'), true);
    assert.equal(detailReads, readsBeforeQuantityChange, 'A confirmed item update must not trigger a full-list fetch');
    assert.equal(await evaluate('window.__uxOtherChanges.length'), 0, 'Unrelated product text must not be rebuilt');
    await evaluate('window.__uxOtherObserver.disconnect()');
    // Exercise decreases independently, including 2 -> 1 where the old UI
    // inserted a helper paragraph and changed row geometry.
    const captureButtons = () => evaluate(`(() => { window.__buttons=Array.from((${listNode}).querySelectorAll('[role="button"],button')).map(node=>({
      node, text:node.textContent, color:getComputedStyle(node.firstElementChild ?? node).color,
      opacity:getComputedStyle(node).opacity, background:getComputedStyle(node).backgroundColor})); })()`);
    const assertPendingButtons = async () => {
      assert.equal(await evaluate(`window.__buttons.every(b=>b.node.isConnected && b.node.textContent===b.text
        && getComputedStyle(b.node.firstElementChild ?? b.node).color===b.color
        && getComputedStyle(b.node).opacity===b.opacity && getComputedStyle(b.node).backgroundColor===b.background)`), true,
      'Pending requests must keep every button mounted with unchanged text, color and opacity');
    };
    const assertDecrease = async (expected: number) => {
      const readsBefore = detailReads, routeBefore = await evaluate('location.pathname');
      const writesBefore = itemWrites;
      await captureButtons();
      await evaluate(`(() => {window.__decreaseScroll=${listNode}; window.__decreaseRow=window.__decreaseScroll.querySelector('[data-testid^="list-item-"]');
        window.__decreaseOther=window.__decreaseScroll.querySelectorAll('[data-testid^="list-item-"]')[1];
        window.__decreaseName=window.__decreaseScroll.querySelector('input[aria-label="Rename list"]');
        window.__decreaseHeight=window.__decreaseRow.getBoundingClientRect().height; window.__decreaseChanges=[];
        window.__decreaseObserver=new MutationObserver(records=>window.__decreaseChanges.push(...records));
        window.__decreaseObserver.observe(window.__decreaseOther,{subtree:true,childList:true,characterData:true,attributes:true});
        window.__decreaseRow.querySelector('input').focus();})()`);
      holdItemRequest(); await click('Decrease Coca-Cola quantity', true);
      await wait(`(${element('Decrease Coca-Cola quantity')})?.getAttribute('aria-disabled') === 'true'`);
      await assertPendingButtons();
      assert.equal(await evaluate(`(${element('Compare Basket')}).getAttribute('aria-disabled')`), 'true');
      assert.equal(await evaluate(`window.__decreaseRow.innerText.includes('Saved quantity: ${expected + 1} complete packages')`), true);
      assert.equal(await evaluate(`window.__decreaseScroll.contains(window.__decreaseOther) && window.__decreaseScroll.contains(window.__decreaseName)`), true);
      releaseItem(); await wait(`window.__decreaseRow.innerText.includes('Saved quantity: ${expected} complete packages')`);
      assert.equal(itemWrites, writesBefore + 1, 'Duplicate decrease taps must send only one write');
      assert.equal(await evaluate('window.__buttons.every(b=>b.node.isConnected && b.node.textContent===b.text)'), true, 'Quantity changes must not remount buttons');
      if (expected === 1) assert.equal(await evaluate(`(${element('Decrease Coca-Cola quantity')}).getAttribute('aria-disabled')`), 'true', 'The lower bound stays disabled after completion');
      assert.equal(await evaluate(`window.__decreaseRow.querySelector('input').value`), String(expected));
      assert.equal(await evaluate(`window.__decreaseRow.getBoundingClientRect().height === window.__decreaseHeight`), true, 'Decreasing to one must not insert/remove layout content');
      assert.equal(await evaluate(`window.__decreaseScroll === (${listNode}) && window.__decreaseScroll.contains(window.__decreaseRow) && window.__decreaseScroll.contains(window.__decreaseOther) && window.__decreaseScroll.contains(window.__decreaseName)`), true);
      assert.equal(await evaluate('window.__decreaseChanges.length'), 0, 'Decrease must not mutate unrelated row content or controls');
      assert.equal(detailReads, readsBefore); assert.equal(await evaluate('location.pathname'), routeBefore);
      await evaluate('window.__decreaseObserver.disconnect()');
    };
    await assertDecrease(2); await assertDecrease(1);
    await click('Increase Coca-Cola quantity'); await wait(text('Saved quantity: 2 complete packages'));
    await click('Compare Basket'); await wait(text('USD 3.90')); await wait(text('Missing price information for: Master Potato Chips'));
    assert.equal(await evaluate(`document.querySelectorAll('[data-testid="basket-availability-notice"]').length`), 1);
    await click('View item breakdown'); await wait(text('Original unit price: USD')); await wait(text('Verified demonstration observation'));
    await click('Edit shopping list'); await wait(text('Saved quantity: 2 complete packages'));
    await setSplitFixture?.(true);
    await click('Find Cheapest Basket'); await wait(text('Best Single Store')); await wait(text('Multi-Store Option'));
    await wait(text('USD 3.90')); await wait(text('Older price')); await wait(text('DEMONSTRATION DATA'));
    await wait(text('Driving and fuel expenses are excluded')); await wait(text('Master Potato Chips'));
    if (setSplitFixture) { await wait(text('USD 0.90')); await wait(text('2 branches used')); await wait(text('USD 3.00 (76.92%)')); }
    await wait(text('Price coverage: 2/2 products'));
    const optimizationScreenshot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve('dist/t04-optimization.png'), Buffer.from(optimizationScreenshot.data, 'base64'));
    // Browser/SQL/import/API are real. Routing is a deterministic injected fixture;
    // live Lebanese road evidence is recorded separately in t05b-live-routing.json.
    const optimizationBeforeExploring = optimizationQueries.length;
    await click('Supermarkets Along My Route'); await wait(text('Find Supermarkets Along Your Route'));
    const journeyLink = 'https://www.google.com/maps/dir/?api=1&origin=33.9808,35.6389&destination=33.8938,35.5018&travelmode=driving';
    await fill('Paste Journey Link', journeyLink); await click('Import Route');
    await wait(text('Supermarkets Along Your Route')); await wait(text('choose a list for basket comparison'));
    assert.equal(optimizationQueries.length, optimizationBeforeExploring, 'Exploration must not run T04');
    const searchesBeforePrices = discoveryRequests;
    await click('Optional saved-list prices'); await click('Choose a saved list'); await click('Compare Browser acceptance');
    await wait(text('Comparing saved list: Browser acceptance')); await wait(text('Prices unavailable'));
    assert.equal(discoveryRequests, searchesBeforePrices, 'Optional pricing must not recalculate routes');
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="route-branch-1032"]')`), false, '8 min 40 sec exceeds the default 8-minute threshold');
    const slider = 'document.querySelector(\'[aria-label="Maximum additional driving time"]\')';
    await evaluate(`void (window.__detourSlider = ${slider})`);
    const requestsBeforeSlider = discoveryRequests;
    const setSlider = async (value: number) => {
      const bounds = await evaluate(`(() => {const e=${slider}; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+10+(r.width-20)*${value}/30,y:r.y+r.height/2};})()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 });
      await wait(`${slider}.getAttribute('aria-valuenow') === '${value}'`);
    };
    await setSlider(9); await wait(`!!document.querySelector('[data-testid="route-branch-1032"]')`);
    await setSlider(0); await wait(text('No stops within 0 minutes'));
    await setSlider(30); await wait(`!!document.querySelector('[data-testid="route-branch-1032"]')`);
    await setSlider(8);
    assert.equal(discoveryRequests, requestsBeforeSlider, 'Slider must only filter locally');
    assert.equal(await evaluate(`window.__detourSlider === ${slider}`), true, 'Slider must retain DOM identity');
    await evaluate('window.__navigationUrls=[];window.open=url=>{window.__navigationUrls.push(String(url));return null;}');
    await click('Navigate via Zouk');
    const navigation = new URL(await evaluate('window.__navigationUrls.at(-1)'));
    assert.equal(navigation.searchParams.get('origin'), '33.9808,35.6389');
    assert.equal(navigation.searchParams.get('destination'), '33.8938,35.5018');
    assert.equal(navigation.searchParams.get('waypoints'), '33.977974,35.617567');
    for (const width of [320, 390, 430]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Journey screen must not overflow');
      await evaluate(`document.querySelector('[data-testid="route-discovery"]').scrollIntoView({block:'start'})`);
      const screenshot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.resolve(`dist/t05b-route-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await click('Change journey'); await fill('Paste Journey Link', 'https://example.com/maps');
    await click('Import Route'); await wait(text('Enter a supported HTTPS Google Maps link'));
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="route-branch-1078"]')`), false);
    await fill('Paste Journey Link', 'https://www.google.com/maps/dir/?api=1&destination=33.8938,35.5018&travelmode=driving');
    await click('Import Route'); await wait(text('This journey is incomplete'));
    await call('Browser.grantPermissions', { origin, permissions: ['geolocation'] });
    await call('Emulation.setGeolocationOverride', { latitude: 33.9808, longitude: 35.6389, accuracy: 5 });
    await click('Use my current location as start'); await wait(text('My current location')); await wait(text('Supermarkets Along Your Route'));
    await click('Change journey'); failNextDiscovery = true;
    await fill('Paste Journey Link', journeyLink); await click('Import Route'); await wait(text('Road estimates are temporarily unavailable'));
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="route-branch-1078"]')`), false);
    discoveryCoverage = 'partial';
    await click('Retry road estimates'); await wait(`!!document.querySelector('[data-testid="route-branch-1078"]')`);
    await wait(text('Some stops could not be checked'));
    discoveryCoverage = 'empty';
    await click('About these road estimates'); await click('Refresh road estimates');
    await wait(text('Search coverage is incomplete'));
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="route-branch-1078"]')`), false);
    discoveryCoverage = null;
    await click('Go back'); await wait(text('Best Single Store'));
    // Progressive disclosure must reveal the same server observation fields.
    await click('Single-store item breakdown'); await wait(text('Older price'));
    await click('Price observation details'); await wait(text('Verified demonstration observation'));
    for (const width of [320, 390, 430]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Optimization must not overflow horizontally');
      const screenshot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.resolve(`dist/ui-optimization-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await click('Up to 3 branches'); await wait(text('Maximum branches: 3')); await wait(text('Best Single Store'));
    assert.ok(optimizationQueries.includes('?maxStores=3'));
    await click('One branch'); await wait(text('Maximum branches: 1')); await wait(text('1 branch used'));
    await wait(text('No merchandise savings'));
    assert.ok(optimizationQueries.includes('?maxStores=1'));
    failNextOptimization = true; await click('Refresh optimization'); await wait(text('The backend could not complete'));
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="optimization-results"]')`), false);
    await click('Retry'); await wait(text('Best Single Store'));
    noPriceCoverage = true; await click('Refresh optimization'); await wait(text('No complete solution within 1 branch'));
    await wait(text('No usable price anywhere for:')); noPriceCoverage = false;
    await click('Refresh optimization'); await wait(text('Best Single Store'));
    await click('Edit shopping list'); await wait(text('Saved quantity: 2 complete packages'));
    await click('Increase Coca-Cola quantity'); await wait(text('Saved quantity: 3 complete packages'));
    await click('Find Cheapest Basket'); await wait(text('USD 5.50')); await wait(text('Quantity: 3 packages'));
    await click('Edit shopping list'); await wait(text('Saved quantity: 3 complete packages'));
    await click('Decrease Coca-Cola quantity'); await wait(text('Saved quantity: 2 complete packages'));
    const readsBeforeRemoval = detailReads, routeBeforeRemoval = await evaluate('location.pathname');
    const writesBeforeRemoval = itemWrites;
    await captureButtons();
    await evaluate(`(() => {window.__removalScroll=${listNode}; window.__removedRow=window.__removalScroll.querySelector('[data-testid^="list-item-"]');
      window.__remainingRow=window.__removalScroll.querySelectorAll('[data-testid^="list-item-"]')[1];
      window.__remainingName=window.__removalScroll.querySelector('input[aria-label="Rename list"]'); window.__removalChanges=[];
      window.__removalObserver=new MutationObserver(records=>window.__removalChanges.push(...records));
      window.__removalObserver.observe(window.__remainingRow,{subtree:true,childList:true,characterData:true,attributes:true});
      window.__removedRow.querySelector('input').focus();})()`);
    holdItemRequest(); await click('Remove product', true);
    await wait(`window.__removedRow.querySelector('[aria-label="Remove product"]')?.getAttribute('aria-disabled') === 'true'
      || Array.from(window.__removedRow.querySelectorAll('[role="button"],button')).some(e=>e.textContent.trim().toLowerCase()==='remove product' && e.getAttribute('aria-disabled')==='true')`);
    await assertPendingButtons();
    assert.equal(await evaluate('window.__removalScroll.contains(window.__removedRow) && window.__removalScroll.contains(window.__remainingRow)'), true);
    releaseItem();
    await wait(`!(${text('Saved quantity: 2 complete packages')})`);
    assert.equal(itemWrites, writesBeforeRemoval + 1, 'Duplicate removal taps must send only one write');
    assert.equal(await evaluate('window.__buttons.filter(b=>!window.__removedRow.contains(b.node)).every(b=>b.node.isConnected && b.node.textContent===b.text && getComputedStyle(b.node.firstElementChild ?? b.node).color===b.color)'), true, 'Removing one row must retain surrounding buttons and colors');
    assert.equal(await evaluate(`window.__removalScroll === (${listNode}) && window.__removalScroll.innerText.includes('Saved quantity: 1 complete packages')`), true);
    assert.equal(await evaluate('!window.__removalScroll.contains(window.__removedRow) && window.__removalScroll.contains(window.__remainingRow) && window.__removalScroll.contains(window.__remainingName)'), true);
    assert.equal(await evaluate('window.__removalChanges.length'), 0, 'Removal must not rebuild or modify the remaining row');
    assert.equal(detailReads, readsBeforeRemoval); assert.equal(await evaluate('location.pathname'), routeBeforeRemoval);
    await evaluate('window.__removalObserver.disconnect()');
    await click('Delete list'); await wait(text('This cannot be undone.')); await click('Cancel');
    await click('Delete list'); await click('Confirm delete list'); await wait(text('No shopping lists yet.'));
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e=>e.textContent.includes('Explore')).click()`);
    await fill('Search products', 'Coke 1.5L');
    const productSelector = '[role="button"][aria-label*="1.5 L"][aria-label*="Product details"]';
    await wait(`!!document.querySelector(${JSON.stringify(productSelector)})`); await evaluate(`document.querySelector(${JSON.stringify(productSelector)}).click()`);
    await click('Add to Shopping List'); await wait(text('You have no shopping lists.'));
    await fill('Create list', 'From Explore'); await click('Create list'); await click('Add to From Explore');
    await wait(text('✓ Coca-Cola added to From Explore'));
    assert.equal(await evaluate('location.pathname'), '/products/1/add');
    await click('Open From Explore');
    await wait(text('Saved quantity: 1 complete packages'));
    await click('Delete list'); await click('Confirm delete list'); await wait(text('No shopping lists yet.'));
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e=>e.textContent.includes('Profile')).click()`);
    await click('Log out'); await wait(text('Create an account'));
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e=>e.textContent.includes('Shopping List')).click()`);
    await wait(text('Log in or register to save lists'));
    await click('Browse products'); await wait(`!!document.querySelector('input[aria-label="Search products"]')`);
    assert.deepEqual(errors, []);
  } finally {
    await setSplitFixture?.(false);
    if (socket?.readyState === WebSocket.OPEN) { void call('Browser.close').catch(() => {}); socket.close(); } else chrome.kill();
    await closed; await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep) && /^t03c-browser-/.test(path.basename(profile)));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
