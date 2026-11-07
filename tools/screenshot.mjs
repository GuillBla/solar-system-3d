// Headless screenshots + console capture through the Chrome DevTools Protocol
// (no dependency: Node >= 22 provides WebSocket).
// Usage: node tools/screenshot.mjs <out.png> "<url>" [waitSeconds] [width] [height] ["js to eval before capture"]
// Requires a local server (npm start) and Chrome/Edge (CHROME env var to override the path).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, url, wait = '8', width = '1440', height = '900', script = ''] = process.argv.slice(2);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'ssm-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`, '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  if (msg.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) logs.push(`[${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: +width < 700 });
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(+wait * 1000);
if (script) {
  const r = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
  if (r.result?.result?.value !== undefined) logs.push(`[eval] ${JSON.stringify(r.result.result.value)}`);
  if (r.result?.exceptionDetails) logs.push(`[eval-error] ${r.result.exceptionDetails.exception?.description}`);
  await sleep(2500);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(logs.length ? logs.join('\n') : '(no console messages)');
ws.close();
chrome.kill();
process.exit(0);
