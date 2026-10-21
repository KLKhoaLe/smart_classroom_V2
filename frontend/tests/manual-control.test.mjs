import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOverrides, remainingSeconds, countdown, overrideMode, manualPayload, sendManualRequest } from '../lib/manual-control.ts';
import { isAllowedBackendGet } from '../lib/backend-routes.ts';

const device = '20000000-0000-4000-8000-000000000001';
const start = Date.parse('2026-10-20T12:00:00Z');
const record = { device_id: device, command_type: 'FAN', action: 'ON', expires_at: '2026-10-20T12:01:00Z' };

test('read current backend override contract, including an empty list', () => {
  assert.deepEqual(parseOverrides([record], device), [record]);
  assert.deepEqual(parseOverrides([], device), []);
});

test('wrong device, duplicate actuator and malformed overrides never become AUTO', () => {
  for (const input of [{}, null, [null], [{ ...record, device_id: 'another-device' }],
    [record, record], [{ ...record, expires_at: 'bad-date' }], [{ ...record, action: 'MAYBE' }],
    [{ ...record, command_type: 'UNKNOWN' }]]) {
    assert.throws(() => parseOverrides(input, device));
  }
});

test('countdown survives reload by deriving time from expires_at, not initial duration', () => {
  assert.equal(remainingSeconds(record.expires_at, start), 60);
  assert.equal(remainingSeconds(record.expires_at, start + 45_000), 15);
  assert.equal(countdown(remainingSeconds(record.expires_at, start + 45_000)), '0:15');
  assert.equal(countdown(120 * 60), '120:00');
});

test('override expires exactly at deadline and remaining time never goes negative', () => {
  assert.equal(remainingSeconds(record.expires_at, start + 59_999), 1);
  assert.equal(remainingSeconds(record.expires_at, start + 60_000), 0);
  assert.equal(remainingSeconds(record.expires_at, start + 90_000), 0);
  assert.equal(overrideMode(record, start + 60_000, true).kind, 'auto');
});

test('connection loss cannot mislabel cached or expired data as confirmed AUTO', () => {
  assert.equal(overrideMode(record, start, false).kind, 'unknown');
  assert.equal(overrideMode(record, start + 90_000, false).kind, 'unknown');
  assert.equal(overrideMode(undefined, start, false).kind, 'unknown');
});

test('verified active override and no override are distinct', () => {
  assert.equal(overrideMode(record, start, true).kind, 'manual');
  assert.match(overrideMode({ ...record, action: 'OFF' }, start, true).label, /TẮT/);
  assert.equal(overrideMode(undefined, start, true).label, 'AUTO được phép');
});

test('manual payload matches existing ManualDto and accepts both duration boundaries', () => {
  assert.deepEqual(manualPayload(device, 'FAN', 'OFF', 1), { device_id: device, command_type: 'FAN', action: 'OFF', override_minutes: 1 });
  assert.equal(manualPayload(device, 'LIGHT', 'ON', 120).override_minutes, 120);
  for (const value of [0, -1, 121, 1.5, NaN, '10']) assert.throws(() => manualPayload(device, 'FAN', 'ON', value));
  assert.throws(() => manualPayload(device, 'UNKNOWN', 'ON', 10));
  assert.throws(() => manualPayload(device, 'FAN', 'TOGGLE', 10));
});

test('request goes only through frontend proxy with selected duration and cancellation signal', async () => {
  const signal = new AbortController().signal;
  const payload = manualPayload(device, 'FAN', 'ON', 5);
  await sendManualRequest(payload, signal, async (url, options) => {
    assert.equal(url, '/api/backend/commands/manual');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(options.signal, signal);
    return Response.json({ accepted: true });
  });
});

test('HTTP 2xx without accepted=true is not reported as accepted', async () => {
  const payload = manualPayload(device, 'FAN', 'ON', 5);
  for (const body of [{}, { accepted: false }, { accepted: 'true' }]) {
    await assert.rejects(sendManualRequest(payload, new AbortController().signal, async () => Response.json(body)), /chưa xác nhận/);
  }
});

test('HTTP rejection and broken JSON do not imply device success', async () => {
  const payload = manualPayload(device, 'FAN', 'ON', 5);
  await assert.rejects(sendManualRequest(payload, new AbortController().signal, async () => Response.json({ message: 'Webhook chưa cấu hình' }, { status: 503 })), /Webhook chưa cấu hình/);
  await assert.rejects(sendManualRequest(payload, new AbortController().signal, async () => new Response('invalid JSON')), /chưa xác nhận/);
});

test('uncertain network failure does not automatically resubmit a command', async () => {
  let calls = 0;
  await assert.rejects(sendManualRequest(manualPayload(device, 'FAN', 'ON', 1), new AbortController().signal, async () => {
    calls++; throw new Error('network interrupted');
  }), /network interrupted/);
  assert.equal(calls, 1);
});

test('proxy permits only existing GET routes and the single override-read route', () => {
  assert.equal(isAllowedBackendGet(['dashboard']), true);
  assert.equal(isAllowedBackendGet(['automation', 'overrides', device]), true);
  assert.equal(isAllowedBackendGet(['automation', 'overrides', 'ESP32_A101']), true);
  for (const route of [[], ['automation'], ['automation', 'resolve'], ['automation', 'commands', device, 'dispatch'],
    ['automation', 'overrides'], ['automation', 'overrides', '..'], ['automation', 'overrides', 'x?token=y'],
    ['automation', 'overrides', device, 'extra'], ['dashboard', '']]) {
    assert.equal(isAllowedBackendGet(route), false, route.join('/'));
  }
});
