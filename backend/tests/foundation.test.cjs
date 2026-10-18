const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {InitialSchema1792200000000}=require('../dist/database/migrations/1792200000000-InitialSchema');
const {seed}=require('../dist/database/seed');
const {DeviceService}=require('../dist/modules/device.service');
const {TelemetryService}=require('../dist/modules/telemetry.service');
const {CommandsService}=require('../dist/modules/commands.service');
const {DashboardService}=require('../dist/modules/dashboard.service');
// Match TypeORM PostgresQueryRunner raw UPDATE/DELETE return shape.
function wrap(pg){return {query:async(sql,args)=>{
 if(args===undefined){const results=await pg.exec(sql);return results.at(-1)?.rows||[];}
 const r=await pg.query(sql,args);
 return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows??0]:r.rows;
},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))};}

test('PostgreSQL engine: migrate, seed idempotency, telemetry, command lifecycle, stale ACK, rollback',async()=>{
 const pg=new PGlite();const db=wrap(pg);const migration=new InitialSchema1792200000000();
 try{
  await migration.up(db);await seed(db);await seed(db);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rooms'))[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM device_states'))[0].n,4);
  const devices=new DeviceService(db),telemetry=new TelemetryService(db,devices),commands=new CommandsService(db,devices),dashboard=new DashboardService(db);
  const payload={device_id:'ESP32_A101',event_id:randomUUID(),run_id:randomUUID(),sequence:1,observed_at:new Date().toISOString(),temperature:34,humidity:60,light_percent:70,occupancy_count:12,co2_ppm:700,power_w:500,door_open:false};
  assert.equal((await telemetry.create(payload)).created,true);assert.equal((await telemetry.create(payload)).created,false);
  await assert.rejects(()=>telemetry.create({...payload,temperature:35}),/dữ liệu khác/);
  await assert.rejects(()=>telemetry.create({...payload,event_id:randomUUID(),occupancy:false}),/mâu thuẫn/);
  const input={device_id:'ESP32_A101',command_type:'FAN',action:'ON',source:'TEST',idempotency_key:'one',ttl_seconds:60};
  const first=(await commands.create(input)).command;
  assert.equal((await commands.create(input)).created,false);
  await assert.rejects(()=>commands.create({...input,action:'OFF'}),/yêu cầu khác/);
  assert.equal((await devices.states('ESP32_A101')).find(x=>x.command_type==='FAN').actual_state,null);
  await assert.rejects(()=>commands.ack({command_id:first.id,device_id:'ESP32_A101',status:'SUCCESS',actual_state:{FAN:'ON'}}),/chưa được/);
  await commands.dispatch(first.id);const claimed=await commands.claim('ESP32_A101');assert.equal(claimed.commands.length,1);assert.equal((await commands.claim('ESP32_A101')).commands.length,0);
  const ack={command_id:first.id,device_id:'ESP32_A101',status:'SUCCESS',actual_state:{FAN:'ON'},sequence:Number(first.sequence)};
  assert.equal((await commands.ack(ack)).status,'ACK');assert.equal((await commands.ack(ack)).duplicate,true);
  assert.equal((await devices.states('ESP32_A101')).find(x=>x.command_type==='FAN').actual_state,'ON');
  const second=(await commands.create({...input,action:'OFF',idempotency_key:'two'})).command;await commands.dispatch(second.id);await commands.claim('ESP32_A101');
  await db.query("UPDATE device_commands SET requested_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[second.id]);
  assert.equal((await commands.expire()).expired,1);
  assert.equal((await commands.ack({command_id:second.id,device_id:'ESP32_A101',status:'SUCCESS',actual_state:{FAN:'OFF'}})).late,true);
  assert.equal((await devices.states('ESP32_A101')).find(x=>x.command_type==='FAN').actual_state,'ON');
  assert.equal((await dashboard.get()).stats.telemetry_count,1);
  await migration.down(db);assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"))[0].n,0);
  await migration.up(db);await seed(db);assert.equal((await devices.list()).length,1);
 }finally{await pg.close();}
});
