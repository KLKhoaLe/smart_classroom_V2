const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');
const {InitialSchema1792200000000}=require('../dist/database/migrations/1792200000000-InitialSchema');
const {IncidentsReportsV11792500000000}=require('../dist/database/migrations/1792500000000-IncidentsReportsV1');
const {seed}=require('../dist/database/seed');const {IncidentReportService}=require('../dist/modules/incident-report.service');
function wrap(pg){return {query:async(sql,args)=>{if(args===undefined)return (await pg.exec(sql)).at(-1)?.rows||[];return (await pg.query(sql,args)).rows;},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))};}
test('WF10 incident dedup, normalized lifecycle, assignment, timeline and notification',async()=>{
 const pg=new PGlite(),db=wrap(pg);try{await new InitialSchema1792200000000().up(db);await new IncidentsReportsV11792500000000().up(db);await seed(db);const svc=new IncidentReportService(db);
  const body={device_id:'ESP32_A101',type:'temperature',severity:'medium',title:'Nhiệt độ cao',details:{temperature:34}};
  const first=await svc.upsertIncident(body),again=await svc.upsertIncident(body);assert.equal(first.type,'HIGH_TEMPERATURE');assert.equal(first.severity,'WARNING');assert.equal(again.id,first.id);assert.equal(again.count,2);assert.equal(again.duplicate,true);
  await svc.updateIncident(first.id,{status:'ACKNOWLEDGED',assigned_to:'operator@example.test'});await svc.updateIncident(first.id,{status:'RESOLVED'});
  const detail=await svc.detailIncident(first.id);assert.equal(detail.assigned_to,'operator@example.test');assert.equal(detail.status,'RESOLVED');assert.ok(detail.timeline.length>=2);
  assert.equal((await svc.notifications()).length,1);assert.equal((await svc.listIncidents({room:'A101',severity:'WARNING',status:'RESOLVED',assigned_to:'operator@example.test'})).length,1);
 }finally{await pg.close();}
});
test('WF11 daily report persists room-local aggregation and command/incident metrics',async()=>{
 const pg=new PGlite(),db=wrap(pg);try{await new InitialSchema1792200000000().up(db);await new IncidentsReportsV11792500000000().up(db);await seed(db);
  const [device]=await db.query(`SELECT id FROM devices WHERE code='ESP32_A101'`);const observed='2026-10-22T03:00:00.000Z';
  await db.query(`INSERT INTO telemetry(id,event_id,run_id,device_id,sequence,observed_at,temperature,humidity,light_percent,occupancy_count,co2_ppm,power_w,door_open,simulated,raw_payload) VALUES($1,$2,$3,$4,1,$5,30,70,50,10,1200,500,false,true,'{}')`,[randomUUID(),randomUUID(),randomUUID(),device.id,observed]);
  const svc=new IncidentReportService(db);const report=await svc.aggregateDaily('A101','2026-10-22');assert.equal(report.type,'DAILY');assert.equal(Number(report.metrics.telemetry_count),1);assert.equal(Number(report.metrics.avg_co2_ppm),1200);assert.equal((await svc.listReports({room:'A101',type:'DAILY'})).length,1);
 }finally{await pg.close();}
});
