import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSensor, formatTime, sampleStatus } from '../lib/dashboard.ts';

test('zero occupants/power remain zero; missing and invalid values are not fabricated', () => {
  assert.equal(formatSensor(0), '0');
  assert.equal(formatSensor('0', ' W'), '0 W');
  for (const value of [null, undefined, '', '  ', 'invalid', NaN, Infinity]) {
    assert.equal(formatSensor(value), '—');
  }
});

test('PostgreSQL numeric strings and numbers display identically with units', () => {
  assert.equal(formatSensor('28.50', ' °C'), formatSensor(28.5, ' °C'));
  assert.equal(formatSensor('28.50', ' °C'), '28,5 °C');
  assert.equal(formatSensor(60, ' %'), '60 %');
});

test('a sample becomes stale after 30 seconds even if no new API response arrives', () => {
  const sample = '2026-10-18T12:00:00.000Z';
  const time = Date.parse(sample);
  assert.equal(sampleStatus(sample, time + 30_000).kind, 'fresh');
  assert.equal(sampleStatus(sample, time + 30_001).kind, 'stale');
});

test('missing, invalid, and future timestamps cannot be presented as fresh', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z');
  assert.equal(sampleStatus(null, now).kind, 'missing');
  assert.equal(sampleStatus('invalid', now).kind, 'invalid');
  assert.equal(sampleStatus('2026-10-18T12:00:10.000Z', now).kind, 'invalid');
  assert.equal(formatTime('invalid'), 'Chưa có');
});
