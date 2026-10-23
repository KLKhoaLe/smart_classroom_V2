const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {PGlite}=require('@electric-sql/pglite');
const {DataSource}=require('typeorm');
const {NestFactory}=require('@nestjs/core');
const {ValidationPipe}=require('@nestjs/common');
const {InitialSchema1792200000000}=require('../dist/database/migrations/1792200000000-InitialSchema');
const {seed}=require('../dist/database/seed');
const {ApiController}=require('../dist/modules/api.controller');
const {DeviceService}=require('../dist/modules/device.service');
const {TelemetryService}=require('../dist/modules/telemetry.service');
const {CommandsService}=require('../dist/modules/commands.service');
const {DashboardService}=require('../dist/modules/dashboard.service');const {IncidentReportService}=require('../dist/modules/incident-report.service');
// Match TypeORM PostgresQueryRunner raw UPDATE/DELETE return shape.
function wrap(pg){return {query:async(sql,args)=>{
 if(args===undefined){const results=await pg.exec(sql);return results.at(-1)?.rows||[];}
 const r=await pg.query(sql,args);
 return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows??0]:r.rows;
},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))};}

test('Nest HTTP + bundled simulator: telemetry -> command -> claim -> ACK -> dashboard',async()=>{
 const pg=new PGlite(),db=wrap(pg);let app;
 try{
  await new InitialSchema1792200000000().up(db);await new (require('../dist/database/migrations/1792700000000-ActuatorLevels').ActuatorLevels1792700000000)().up(db);await seed(db);
  class TestModule{}
  app=await NestFactory.create({module:TestModule,controllers:[ApiController],providers:[{provide:DataSource,useValue:db},DeviceService,TelemetryService,CommandsService,DashboardService,IncidentReportService]},{logger:false});
  app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:true}));await app.listen(0,'127.0.0.1');
  const url=await app.getUrl();
  const {Simulator}=await import(pathToFileURL(path.resolve(__dirname,'../../simulator/src/engine.js')).href);
  const sim=new Simulator();sim.update({mode:'http',telemetry_url:url+'/api/telemetry',heartbeat_url:url+'/api/devices/heartbeat',ack_url:url+'/api/commands/ack',claim_url:url+'/api/commands/claim'});
  assert.equal((await sim.telemetry()).delivered,true);assert.equal(await sim.heartbeat(),true);
  async function post(route,b){const r=await fetch(url+'/api/'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const data=await r.json();assert.equal(r.ok,true,JSON.stringify(data));return data;}
  const created=await post('commands',{device_id:'ESP32_A101',command_type:'LIGHT',action:'ON',idempotency_key:'http-e2e',source:'TEST'});
  await post('commands/'+created.command.command_id+'/dispatch',{});await sim.poll();
  assert.equal(sim.devices.LIGHT,'ON');assert.equal(sim.counters.acks,1);
  const result=await (await fetch(url+'/api/commands/'+created.command.command_id+'/status')).json();assert.equal(result.status,'ACK');
  const dashboard=await (await fetch(url+'/api/dashboard')).json();assert.equal(dashboard.devices[0].states.find(s=>s.command_type==='LIGHT').actual_state,'ON');assert.equal(dashboard.stats.telemetry_count,1);
  const bad=await fetch(url+'/api/telemetry',{method:'POST',headers:{'content-type':'application/json'},body:'{"temperature":999}'});assert.equal(bad.status,400);
 }finally{if(app)await app.close();await pg.close();}
});
