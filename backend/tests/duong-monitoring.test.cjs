const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {evaluate}=require('../dist/modules/duong-monitoring/evaluate');
const {MonitoringService}=require('../dist/modules/duong-monitoring/monitoring.module');
const {setupMonitoring,demoSettings}=require('../dist/modules/duong-monitoring/setup');
const {InitialSchema1792200000000}=require('../dist/database/migrations/1792200000000-InitialSchema');
const {DuongMonitoring1792600000000}=require('../dist/database/migrations/1792600000000-DuongMonitoring');
const {seed}=require('../dist/database/seed');
const {TelemetryService}=require('../dist/modules/telemetry.service'),{DeviceService}=require('../dist/modules/device.service');
const epoch=Date.parse('2026-10-21T11:00:00Z'); // 18:00 Asia/Ho_Chi_Minh, outside demo schedule.
function context(second=0,overrides={}){return {
 telemetry:{id:randomUUID(),device_id:'20000000-0000-4000-8000-000000000001',event_id:randomUUID(),run_id:'demo',sequence:second,
 observed_at:new Date(epoch+second*1000).toISOString(),temperature:27,humidity:50,co2_ppm:600,power_w:600,occupancy_count:0,door_open:false,simulated:true,...overrides},
 policy:{id:'policy',config:{temperature_on:30,humidity_on:75,co2_on:1200,empty_delay_seconds:30}},settings:{...demoSettings},
 room:{code:'A101',timezone:'Asia/Ho_Chi_Minh'},schedules:[{weekday:3,starts_at:'08:00:00',ends_at:'17:00:00'}],state:null,rules_key:'one'};}
function advance(c,n,flow,change={}){const r=evaluate(c,flow);return {...c,telemetry:{...c.telemetry,id:randomUUID(),event_id:randomUUID(),sequence:n,observed_at:new Date(epoch+n*1000).toISOString(),...change},state:r.next_state};}
test('WF07: hold 20s, three actuators, no repeat event, per-metric recovery after 10s',()=>{
 let c=context(0,{temperature:38,humidity:85,co2_ppm:1800});
 assert.equal(evaluate(c,7).proposals.length,0);c=advance(c,10,7);assert.equal(evaluate(c,7).events.length,0);
 c=advance(c,20,7);let r=evaluate(c,7);assert.equal(r.events.length,3);assert.deepEqual(r.proposals[0].desired_state,{FAN:'ON',DEHUMIDIFIER:'ON',VENTILATION:'ON'});
 c=advance(c,30,7);assert.equal(evaluate(c,7).events.length,0);
 c=advance(c,40,7,{humidity:50});assert.equal(evaluate(c,7).proposals[0].desired_state.DEHUMIDIFIER,'ON');
 c=advance(c,50,7);r=evaluate(c,7);assert.equal(r.events.length,1);assert.equal(r.events[0].recovered,true);assert.equal(r.proposals[0].desired_state.DEHUMIDIFIER,undefined);
});
test('WF07: loss of continuity and policy changes restart hold; invalid values reject',()=>{
 let c=context(0,{humidity:85});c=advance(c,40,7);assert.equal(evaluate(c,7).proposals.length,0);
 c=advance(c,50,7);c.rules_key='changed';assert.equal(evaluate(c,7).proposals.length,0);
 c.telemetry.humidity=null;assert.equal(evaluate(c,7).status,'REJECTED');
 const invalid=context();invalid.policy.config.co2_on='1200';assert.equal(evaluate(invalid,7).status,'REJECTED');
});
test('WF08: wait, high-power event, trapezoid kWh, duplicate and recovery',()=>{
 let c=context();assert.equal(evaluate(c,8).observations.mode,'WAITING_EMPTY');
 for(const n of [10,20,30])c=advance(c,n,8);
 const r=evaluate(c,8);assert.equal(r.observations.mode,'EMPTY_READY');assert.equal(r.events[0].type,'EMPTY_HIGH_POWER');
 assert.ok(Math.abs(r.observations.energy_kwh_observed-0.005)<1e-10);
 assert.deepEqual(r.proposals[0].desired_state,{FAN:'OFF',LIGHT:'OFF'});
 assert.equal(evaluate({...c,state:r.next_state},8).status,'IGNORED');
 c=advance(c,40,8,{occupancy_count:1});assert.equal(evaluate(c,8).proposals.length,0);
 c=advance(c,50,8);assert.equal(evaluate(c,8).events[0].recovered,true);
});
test('WF08: gap/run change never fabricate energy or continuous vacancy',()=>{
 let c=context();c=advance(c,10,8);const total=evaluate(c,8).observations.energy_kwh_observed;
 c=advance(c,80,8);let r=evaluate(c,8);assert.equal(r.observations.interval_kwh,0);assert.equal(r.observations.energy_kwh_observed,total);assert.equal(r.observations.missing_seconds,70);assert.equal(r.observations.empty_seconds,0);
 c=advance(c,90,8,{run_id:'new',sequence:0});r=evaluate(c,8);assert.equal(r.observations.interval_kwh,0);assert.equal(r.observations.empty_seconds,0);
});
test('WF09: door only outside hours; no repeat; delayed recovery; within schedule quiet',()=>{
 let c=context(0,{door_open:true});let r=evaluate(c,9);assert.equal(r.events.length,1);assert.equal(r.events[0].recovered,false);
 c=advance(c,10,9);assert.equal(evaluate(c,9).events.length,0);
 c=advance(c,20,9,{door_open:false});assert.equal(evaluate(c,9).events.length,0);
 c=advance(c,30,9);c=advance(c,40,9);assert.equal(evaluate(c,9).events[0].recovered,true);
 const inside=context(0,{door_open:true,observed_at:'2026-10-21T03:00:00Z'});assert.equal(evaluate(inside,9).events.length,0);
 inside.schedules=null;assert.equal(evaluate(inside,9).status,'REJECTED');
});
test('WF09: end boundary excluded, people trigger even door shut, timezone validation',()=>{
 const c=context(0,{occupancy_count:1,observed_at:'2026-10-21T10:00:00Z'});
 assert.equal(evaluate(c,9).events.length,1);c.room.timezone='not/a/timezone';assert.equal(evaluate(c,9).status,'REJECTED');
});
function wrap(pg){return {query:async(sql,args)=>{
 if(args===undefined)return (await pg.exec(sql)).at(-1)?.rows||[];
 const r=await pg.query(sql,args);return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows??0]:r.rows;
},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))};}
test('SQL integration: migrations, persistence/restart, idempotency, proposal expiry, conflicts and no commands',async()=>{
 const pg=new PGlite(),db=wrap(pg),migration=new DuongMonitoring1792600000000();
 try{
  await new InitialSchema1792200000000().up(db);await seed(db);await migration.up(db);await setupMonitoring(db);await setupMonitoring(db);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM schedules'))[0].n,7);
  let svc=new MonitoringService(db);const ingest=new TelemetryService(db,new DeviceService(db));const run=randomUUID();
  let clock=Date.now()-25000,sequence=0;svc.clock=()=>clock;
  async function sample(changes={}){return (await ingest.create({device_id:'ESP32_A101',event_id:randomUUID(),run_id:run,sequence:sequence++,observed_at:new Date(clock).toISOString(),temperature:27,humidity:85,light_percent:50,co2_ppm:600,power_w:600,occupancy_count:0,door_open:false,...changes})).telemetry;}
  async function commit(flow,t){const c=await svc.context(flow,t.id);return svc.commit({flow,telemetry_id:t.id,context_hash:c.context_hash,evaluation:evaluate(c,flow)});}
  let t=await sample();let c=await svc.context(7,t.id);
  await assert.rejects(()=>svc.commit({flow:7,telemetry_id:t.id,context_hash:c.context_hash,evaluation:{fake:true}}),/EVALUATION_MISMATCH/);
  await commit(7,t);await commit(8,t);
  clock+=10000;t=await sample();await commit(7,t);await commit(8,t);
  svc=new MonitoringService(db);svc.clock=()=>clock; // restart, same durable state.
  clock+=10000;t=await sample();const open=await commit(7,t);assert.equal(open.new_events.length,1);assert.equal(open.proposals[0].desired_state.DEHUMIDIFIER,'ON');await commit(8,t);
  const duplicate=await svc.commit({flow:7,telemetry_id:t.id,context_hash:'unused',evaluation:{}});assert.equal(duplicate.created,false);assert.deepEqual(duplicate.new_events,[]);
  let states=await db.query('SELECT state FROM duong_monitoring_states WHERE flow=8');assert.ok(Math.abs(states[0].state.energy_kwh_observed-600*20/3600000)<1e-10);
  clock+=10000;t=await sample({humidity:50});c=await svc.context(7,t.id);
  await db.query("UPDATE duong_monitoring_settings SET config=jsonb_set(config,'{high_power_w}','700')");
  await assert.rejects(()=>svc.commit({flow:7,telemetry_id:t.id,context_hash:c.context_hash,evaluation:evaluate(c,7)}),/CONTEXT_CHANGED/);
  await commit(7,t);clock+=10000;t=await sample({humidity:50});const recovered=await commit(7,t);assert.equal(recovered.new_events[0].recovered,true);assert.equal(recovered.proposals.length,0);
  const [expired]=await db.query("SELECT expires_at FROM control_proposals WHERE source='WF07'");assert.ok(new Date(expired.expires_at).getTime()<=clock);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM device_commands'))[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM incidents'))[0].n,0);
  const [pending]=await db.query("SELECT count(*)::int AS n FROM duong_monitoring_events WHERE delivery_status='PENDING_WF10'");assert.equal(pending.n,2);
  clock+=40000;await assert.rejects(()=>svc.context(7,t.id),/STALE/);
  await migration.down(db);assert.equal((await db.query("SELECT count(*)::int AS n FROM control_proposals WHERE source='WF07'"))[0].n,0);
 }finally{await pg.close();}
});
