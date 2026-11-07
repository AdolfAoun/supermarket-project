// Optional desktop integration, no added packages. Requires Node 24, Chrome,
// exported dist/web, and the owner's running API. Never modifies MySQL/services.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function main() {
  const root = path.resolve(__dirname, '../dist/web');
  assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Export the web app first');
  const api = process.env.LIVE_CATALOG_API_URL ?? 'http://127.0.0.1:3000/api';
  assert.equal((await fetch(`${api}/health/db`)).status, 200);
  const liveComparison = await (await fetch(`${api}/products/1/prices`)).json();
  const emptyComparison = { ...liveComparison, prices: [] };
  const tiedComparison = { ...liveComparison, prices: liveComparison.prices.slice(0, 2).map(price => ({ ...price, price: liveComparison.prices[0].price })) };
  let mode = 'normal';
  const apiCalls = [];
  // Same-origin local proxy avoids changing the owner's CORS or .env. The CDP
  // preload below routes only API requests through it; actual responses are used.
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        apiCalls.push(url.pathname + url.search);
        if (mode === 'offline') { req.socket.destroy(); return; }
        if (mode === 'failure') { res.writeHead(500); res.end('private error'); return; }
        if (mode === 'bad-json') { res.end('{bad'); return; }
        if (mode === 'bad-payload') { res.end('{"products":[{}]}'); return; }
        if (mode === 'empty-catalog' && url.pathname === '/api/products') { res.end('{"products":[]}'); return; }
        if (mode === 'empty-prices' && url.pathname.endsWith('/prices')) { res.end(JSON.stringify(emptyComparison)); return; }
        if (mode === 'tied-prices' && url.pathname.endsWith('/prices')) { res.end(JSON.stringify(tiedComparison)); return; }
        const response = await fetch(`${api}${url.pathname.slice(4)}${url.search}`);
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        if (mode === 'long-layout' && /^\/api\/products\/\d+$/.test(url.pathname) && response.ok) {
          const body = await response.json();
          // Proxy-only text at schema-supported lengths, never stored in MySQL.
          body.product.name = 'Long product name for layout verification '.repeat(4).slice(0, 160);
          body.product.brand = 'Brand description '.repeat(5).slice(0, 80);
          body.product.variant = 'Variant description '.repeat(5).slice(0, 80);
          res.end(JSON.stringify(body)); return;
        }
        res.end(await response.text()); return;
      }
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
      const type = { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png' }[path.extname(target)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(target).pipe(res);
    } catch { res.writeHead(502); res.end('Test proxy unavailable'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 't02-browser-'));
  const chrome = spawn(process.env.BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
      '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const closed = once(chrome, 'close');
  let socket;
  let call;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const start = Date.now();
    while (!fs.existsSync(portFile)) {
      assert.ok(Date.now() - start < 15000, 'Chrome startup timed out');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    let sequence = 0; const pending = new Map(); const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) { const task = pending.get(message.id); pending.delete(message.id);
        if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result); }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    });
    call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    const wait = async expression => {
      const began = Date.now();
      while (!await evaluate(expression)) {
        if (Date.now() - began >= 15000) throw new Error(`Condition timed out: ${expression}; page: ${await evaluate('location.pathname + " " + document.body.innerText.slice(0, 1200)')}`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    const text = value => `document.body.innerText.toLowerCase().includes(${JSON.stringify(value.toLowerCase())})`;
    const navigate = async route => { await call('Page.navigate', { url: origin + route }); };
    const click = async (label, selector = '[role="button"],button,a,[role="tab"]') => {
      const expression = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)} || e.textContent.trim() === ${JSON.stringify(label)})`;
      await wait(`!!(${expression})`); await evaluate(`(${expression}).click()`);
    };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const url = new URL(String(input), location.href);
        return originalFetch(url.pathname.startsWith('/api/') ? location.origin + url.pathname + url.search : input, options);
      };` });

    await navigate('/'); await wait(text('Backend and database connected'));
    assert.equal(await evaluate('document.querySelectorAll(\'[role="tab"]\').length'), 5);
    await click('Browse Products'); await wait('!!document.querySelector(\'input[aria-label="Search products"]\')');
    await evaluate(`(() => { const input = document.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'coca');
      input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const productSelector = '[role="button"][aria-label*="1.5 L"][aria-label*="Product details"]';
    await wait('document.querySelectorAll(\'[role="button"][aria-label*="Product details"]\').length === 2');
    assert.ok(apiCalls.some(call => new URL(call, origin).searchParams.get('search') === 'coca'), 'Search must reach the backend');
    assert.equal(apiCalls.some(call => call.split('?')[0].endsWith('/prices')), false, 'Catalog must not prefetch comparison prices');
    await wait(`!!document.querySelector(${JSON.stringify(productSelector)})`);
    await evaluate(`(() => { const row = document.querySelector(${JSON.stringify(productSelector)}); row.click(); row.click(); })()`);
    await wait(text('Pack quantity: 1')); await click('Compare branch prices');
    await wait(text('USD 1.60')); await wait(text('Lowest displayed demo price'));
    assert.equal(await evaluate('location.pathname'), '/products/1/prices');
    await click('Go back'); await wait(text('Compare branch prices'));
    await click('Go back'); await wait('!!document.querySelector(\'input[aria-label="Search products"]\')');
    assert.equal(await evaluate('document.querySelector("input").value'), 'coca');
    console.log('PASS browser: five tabs, catalog/search → details → prices → back, retained query');

    await navigate('/'); await wait(text('Browse Supermarkets')); await click('Browse Supermarkets');
    await wait(text('Coordinates unavailable')); await wait(text('Jounieh - DEMO'));
    await navigate('/products/2'); await wait(text('330 ml'));
    await click('Go back'); await wait('!!document.querySelector(\'input[aria-label="Search products"]\')');
    await navigate('/products/not-an-id'); await wait(text('Invalid product link'));
    await navigate('/products/4294967295'); await wait(text('This item was not found'));
    console.log('PASS browser: Home → branches, direct details, invalid/missing IDs');

    for (const [failureMode, message] of [['offline', 'Could not reach the backend'], ['failure', 'The server could not complete']]) {
      mode = failureMode; await navigate('/explore'); await wait(text(message));
      mode = 'normal'; await click('Retry'); await wait(`!!document.querySelector(${JSON.stringify(productSelector)})`);
    }
    for (const bad of ['bad-json', 'bad-payload']) {
      mode = bad; await navigate('/explore'); await wait(text('The server returned invalid data'));
      mode = 'normal'; await click('Retry'); await wait(`!!document.querySelector(${JSON.stringify(productSelector)})`);
    }
    mode = 'empty-catalog'; await navigate('/explore'); await wait(text('No registered products'));
    mode = 'empty-prices'; await navigate('/products/1/prices'); await wait(text('No eligible price observations'));
    assert.equal(await evaluate(text('USD 0.00')), false);
    mode = 'tied-prices'; await navigate('/products/1/prices');
    await wait('(document.body.innerText.match(/Lowest displayed demo price/gi) || []).length === 2');
    assert.deepEqual(errors, []);
    console.log('PASS browser: HTTP/malformed-response recovery, empty catalog/prices, no runtime exceptions');

    // Web geometry is a layout regression, not an iOS safe-area simulation.
    const headerGeometry = `(function () {
      const back = document.querySelector('[aria-label="Go back"]');
      if (!back) return null;
      let header = back.parentElement;
      while (header && header.getBoundingClientRect().width < innerWidth * .9) header = header.parentElement;
      return header ? { top: header.getBoundingClientRect().top, bottom: header.getBoundingClientRect().bottom, text: header.textContent } : null;
    })()`;
    const checkBelowHeader = async (testId, title) => {
      const geometry = `(() => {
        const header = ${headerGeometry};
        const content = document.querySelector('[data-testid="${testId}"]');
        if (!header || !content) return null;
        let padded = content.parentElement;
        while (padded && !parseFloat(getComputedStyle(padded).paddingTop)) padded = padded.parentElement;
        return { header, top: content.getBoundingClientRect().top, padding: padded ? parseFloat(getComputedStyle(padded).paddingTop) : 0 };
      })()`;
      await wait(`!!(${geometry}) && (${geometry}).top >= (${geometry}).header.bottom`);
      const measured = await evaluate(geometry);
      assert.ok(measured.header.top >= 0 && measured.header.bottom < await evaluate('innerHeight'));
      assert.ok(measured.header.text.includes(title), 'Visible navigation header retains its screen title');
      assert.ok(Math.abs(measured.top - measured.header.bottom - measured.padding) <= 2,
        `Content should use existing padding once, not another header-sized gap: ${JSON.stringify(measured)}`);
    };
    mode = 'normal';
    for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await navigate('/products/1'); await wait(text('Compare branch prices'));
      await checkBelowHeader('product-identity', 'Product details');
      await navigate('/supermarkets'); await wait(text('Coordinates unavailable'));
      await checkBelowHeader('supermarket-intro', 'Supermarkets and branches');
    }
    await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 400, deviceScaleFactor: 1, mobile: true });
    mode = 'long-layout'; await navigate('/products/1'); await wait(text('Long product name for layout verification'));
    await checkBelowHeader('product-identity', 'Product details');
    assert.equal(await evaluate(`(() => { const scroll = document.querySelector('[data-testid="product-details-scroll"]');
      scroll.scrollTop = scroll.scrollHeight; return scroll.scrollTop > 0; })()`), true, 'Long product content must scroll');
    await wait(`(() => { const button = Array.from(document.querySelectorAll('[role="button"],button')).find(e => e.textContent.trim() === 'Compare branch prices');
      if (!button) return false; const rect = button.getBoundingClientRect(); return rect.top >= (${headerGeometry}).bottom && rect.bottom <= innerHeight; })()`);
    mode = 'normal'; await navigate('/supermarkets'); await wait(text('Coordinates unavailable'));
    await checkBelowHeader('supermarket-intro', 'Supermarkets and branches');
    assert.equal(await evaluate(`(() => { const scroll = document.querySelector('[data-testid="supermarket-list"]');
      scroll.scrollTop = scroll.scrollHeight; return scroll.scrollTop > 0; })()`), true, 'Branches must remain scrollable');
    await click('Go back'); await wait(text('Browse Supermarkets'));
    for (const [title, pathname] of [['Explore', '/explore'], ['Shopping List', '/shopping-list'], ['Receipts', '/receipts'], ['Profile', '/profile'], ['Home', '/']]) {
      await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e => e.textContent.includes(${JSON.stringify(title)})).click()`);
      await wait(`location.pathname === ${JSON.stringify(pathname)}`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS browser: header/content separation at three phone widths and landscape, no duplicate gap, long-content scrolling and back');
  } finally {
    if (socket?.readyState === WebSocket.OPEN) {
      void call('Browser.close').catch(() => {}); socket.close();
    } else chrome.kill();
    await closed;
    await new Promise(resolve => server.close(resolve));
    // Only remove the freshly created profile, after checking its resolved boundary.
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(path.resolve(profile).startsWith(tempRoot) && /^t02-browser-/.test(path.basename(profile)));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
