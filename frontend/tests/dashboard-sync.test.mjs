import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptResult, readResource, refreshResources } from '../lib/dashboard-sync.ts';

const snapshot = { devices: [{ id: 'A101', temperature: '28.50' }], stats: {}, decisions: [], manual_enabled: false };
const response = value => Response.json(value);

test('commands HTTP failure does not discard a successful dashboard response', async () => {
  const results = {};
  await refreshResources({
    signal: new AbortController().signal,
    fetcher: async url => url.endsWith('/dashboard') ? response(snapshot) : new Response('', { status: 503 }),
    onDashboard: result => { results.dashboard = result; },
    onCommands: result => { results.commands = result; },
  });
  assert.deepEqual(results.dashboard, { ok: true, value: snapshot });
  assert.deepEqual(results.commands, { ok: false, error: 'HTTP 503' });
});

test('dashboard network failure does not block new commands', async () => {
  const results = {};
  await refreshResources({
    signal: new AbortController().signal,
    fetcher: async url => {
      if (url.endsWith('/dashboard')) throw new TypeError('Failed to fetch');
      return response([{ id: 'command-1', status: 'ACK' }]);
    },
    onDashboard: result => { results.dashboard = result; },
    onCommands: result => { results.commands = result; },
  });
  assert.equal(results.dashboard.ok, false);
  assert.equal(results.commands.value[0].status, 'ACK');
});

test('successful resource is delivered before the other request finishes', async () => {
  let releaseCommands;
  let notifyDashboard;
  const commandsResponse = new Promise(resolve => { releaseCommands = resolve; });
  const dashboardDelivered = new Promise(resolve => { notifyDashboard = resolve; });
  let commandsDelivered = false;
  const finished = refreshResources({
    signal: new AbortController().signal,
    fetcher: async url => url.endsWith('/dashboard') ? response(snapshot) : commandsResponse,
    onDashboard: notifyDashboard,
    onCommands: () => { commandsDelivered = true; },
  });
  assert.equal((await dashboardDelivered).ok, true);
  assert.equal(commandsDelivered, false);
  releaseCommands(response([]));
  await finished;
  assert.equal(commandsDelivered, true);
});

test('failure keeps last successful values and timestamp; recovery replaces them and clears the error', () => {
  const initial = { value: null, error: '', updatedAt: null };
  const loaded = acceptResult(initial, { ok: true, value: snapshot }, 100);
  const failed = acceptResult(loaded, { ok: false, error: 'HTTP 502' }, 200);
  assert.equal(failed.value, snapshot);
  assert.equal(failed.updatedAt, 100);
  assert.equal(failed.error, 'HTTP 502');
  const recovered = acceptResult(failed, { ok: true, value: { ...snapshot, devices: [] } }, 300);
  assert.equal(recovered.error, '');
  assert.equal(recovered.updatedAt, 300);
  assert.deepEqual(recovered.value.devices, []);
  assert.equal(acceptResult(initial, { ok: false, error: 'offline' }, 400).value, null);
});

test('a hung fetch is aborted on timeout', async () => {
  let observedAbort = false;
  const result = await readResource('/test', new AbortController().signal, async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { observedAbort = true; reject(new Error('aborted')); }, { once: true });
  }), 10);
  assert.equal(observedAbort, true);
  assert.deepEqual(result, { ok: false, error: 'Hết thời gian chờ backend' });
});

test('invalid JSON is a resource failure rather than an unhandled rejection', async () => {
  const result = await readResource('/test', new AbortController().signal, async () => new Response('{bad json'));
  assert.equal(result.ok, false);
});

test('unmount cancellation aborts both requests and delivers no stale callbacks', async () => {
  const controller = new AbortController();
  let aborted = 0;
  let callbacks = 0;
  const finished = refreshResources({
    signal: controller.signal,
    fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted++; reject(new Error('aborted')); }, { once: true });
    }),
    onDashboard: () => { callbacks++; },
    onCommands: () => { callbacks++; },
  });
  controller.abort();
  await finished;
  assert.equal(aborted, 2);
  assert.equal(callbacks, 0);
});
