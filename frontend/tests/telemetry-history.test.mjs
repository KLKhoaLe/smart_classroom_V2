import test from 'node:test';
import assert from 'node:assert/strict';
import { numberOrNull, parseSamples, selectWindow, summary, chartGeometry } from '../lib/telemetry-history.ts';
import { proxyHistory } from '../lib/history-api.ts';
const time = Date.parse('2026-10-21T03:00:00Z');
const row = (id, offset, temperature = 25, extra = {}) => ({ id, device_id: 'dev-a', observed_at: new Date(time + offset).toISOString(), sequence: 1, temperature, ...extra });
test('numeric database strings and zero survive; missing or invalid values are null', () => {
  assert.equal(numberOrNull('0.00'), 0); assert.equal(numberOrNull('-2.5'), -2.5);
  for (const value of [null, undefined, '', '  ', 'oops', true, [], {}, Infinity]) assert.equal(numberOrNull(value), null);
});
test('history sorts by observation time then sequence and removes duplicate ids', () => {
  const samples = parseSamples([row('b', 1000), row('a', 0), row('b', 1000), row('c', 1000, 27, {sequence: 2})], 'dev-a');
  assert.deepEqual(samples.map(r => r.id), ['a', 'b', 'c']);
});
test('another device, bad time or non-array is rejected rather than shown in this room', () => {
  for (const data of [{}, [row('a', 0, 1, {device_id:'dev-b'})], [row('a', 0, 1, {observed_at:'bad'})]]) assert.throws(() => parseSamples(data, 'dev-a'));
});
test('empty history is valid and samples are capped at 100 newest', () => {
  assert.deepEqual(parseSamples([], 'dev-a'), []);
  const samples = parseSamples(Array.from({length:110}, (_,i) => row(String(i), i*1000)), 'dev-a');
  assert.equal(samples.length,100); assert.equal(samples[0].id,'10');
});
test('time filter uses now, includes boundary and excludes future clock errors', () => {
  const samples = parseSamples([row('old',-900001),row('boundary',-900000),row('now',0),row('future',6000)], 'dev-a');
  assert.deepEqual(selectWindow(samples,15,time).map(r=>r.id),['boundary','now']);
  assert.deepEqual(selectWindow(samples,0,time).map(r=>r.id),['old','boundary','now']);
});
test('summary never interprets missing values as zero', () => {
  const samples=parseSamples([row('a',0,0),row('b',5000,null),row('c',10000,'30')],'dev-a');
  assert.deepEqual(summary(samples,'temperature'),{count:2,min:0,max:30,mean:15});
  assert.equal(summary(samples,'humidity').mean,null);
});
test('chart shows single/constant samples without NaN and uses real time spacing', () => {
  const one=chartGeometry(parseSamples([row('a',0,0)],'dev-a'),'temperature');
  assert.equal(one.segments[0][0].x,390); assert.ok(Number.isFinite(one.segments[0][0].y));
  const chart=chartGeometry(parseSamples([row('a',0),row('b',5000),row('c',20000)],'dev-a'),'temperature');
  assert.equal(chart.segments[0][1].x,230);
  assert.ok(chart.high>chart.low);
});
test('chart breaks lines for absent measurements and telemetry gaps over 60 seconds', () => {
  const rows=parseSamples([row('a',0),row('missing',5000,null),row('b',10000),row('c',80000)],'dev-a');
  assert.equal(chartGeometry(rows,'temperature').segments.length,3);
  assert.equal(chartGeometry(rows,'humidity'),null); assert.equal(chartGeometry([],'temperature'),null);
});
test('proxy forwards exactly the selected device to backend and keeps service token server-side', async () => {
  let called;
  const response=await proxyHistory(new Request('http://localhost:3000/api/history?device_id=dev-a'),{backendUrl:'http://backend:3001/',token:'test-only-token',fetcher:async(url,opts)=>{called={url:String(url),opts};return Response.json([]);}});
  assert.equal(called.url,'http://backend:3001/api/telemetry?device_id=dev-a');
  assert.equal(called.opts.headers.authorization,'Bearer test-only-token'); assert.equal(called.opts.method,'GET');
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store'); assert.deepEqual(await response.json(),[]);
});
test('proxy rejects absent, repeated, injected or extra filters before any network call', async () => {
  for (const query of ['', '?device_id=a&device_id=b','?device_id=..%2Fadmin','?device_id=a&url=http://evil']) {
    const result=await proxyHistory(new Request('http://local/api/history'+query),{fetcher:async()=>{throw new Error('should not fetch');}});
    assert.equal(result.status,400);
  }
});
test('backend failure is an error, never an empty successful history', async () => {
  for (const status of [401,404,500]) {
    const result=await proxyHistory(new Request('http://local/api/history?device_id=a'),{fetcher:async()=>new Response('sensitive error',{status})});
    assert.equal(result.status,status); assert.ok(!(await result.text()).includes('sensitive'));
  }
});
test('proxy aborts hung backend requests and reports service unavailable', async () => {
  let aborted=false;
  const result=await proxyHistory(new Request('http://local/api/history?device_id=a'),{timeoutMs:5,fetcher:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('abort'));}))});
  assert.equal(result.status,503); assert.equal(aborted,true);
});
