const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {InitialSchema1792200000000}=require('../dist/database/migrations/1792200000000-InitialSchema');
const {AutomationRunsV31792398000000}=require('../dist/database/migrations/1792398000000-AutomationRunsV3');
const {seed}=require('../dist/database/seed');
const {DeviceService}=require('../dist/modules/device.service');
const {TelemetryService}=require('../dist/modules/telemetry.service');
const {CommandsService}=require('../dist/modules/commands.service');
const {AutomationService,AutomationController}=require('../dist/modules/automation/automation.module');
const {ApiController}=require('../dist/modules/api.controller');
const {DashboardService}=require('../dist/modules/dashboard.service');const {IncidentReportService}=require('../dist/modules/incident-report.service');
const {DataSource}=require('typeorm');const {NestFactory}=require('@nestjs/core');const {ValidationPipe}=require('@nestjs/common');
function wrap(pg){return {query:async(sql,args)=>{if(args===undefined)return (await pg.exec(sql)).at(-1)?.rows||[];const r=await pg.query(sql,args);return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows??0]:r.rows;},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))};}
const device='20000000-0000-4000-8000-000000000001';const types=['FAN','LIGHT','VENTILATION','DEHUMIDIFIER'];
async function setup(){const pg=new PGlite(),db=wrap(pg);await new InitialSchema1792200000000().up(db);await new (require('../dist/database/migrations/1792700000000-ActuatorLevels').ActuatorLevels1792700000000)().up(db);await new AutomationRunsV31792398000000().up(db);await seed(db);
 const devices=new DeviceService(db),telemetry=new TelemetryService(db,devices),commands=new CommandsService(db,devices),automation=new AutomationService(db);
 let seq=0;async function decision(action='ON',changes={}){const t=(await telemetry.create({device_id:device,event_id:randomUUID(),run_id:randomUUID(),sequence:++seq,observed_at:new Date().toISOString(),temperature:29,humidity:72,light_percent:40,occupancy_count:12,co2_ppm:1050,power_w:420,door_open:false})).telemetry;
 const p=await devices.policy('A101');const a=await telemetry.decision({device_id:device,telemetry_id:t.id,source:'AI',reason:'Fixture',actions:{FAN:action,LIGHT:'OFF',VENTILATION:'OFF',DEHUMIDIFIER:'OFF'},evidence:{workflow_version:'V3',policy_id:p.id,policy_version:p.version,valid_until:new Date(Date.now()+60000).toISOString(),allowed_actions:Object.fromEntries(types.map(t=>[t,['ON','OFF']])),...changes}});return {device_id:device,source:'AUTO',decision_id:a.id};}
 return {pg,db,devices,telemetry,commands,automation,decision};}

test('AUTO lifecycle: four initial commands, replay, guarded queue, claim, ACK, no redundant command',async()=>{const s=await setup();try{
 const b=await s.decision();const a=await s.automation.resolve(b);assert.equal(a.commands.length,4);
 const retry=await s.automation.resolve(b);assert.equal(retry.duplicate,true);assert.deepEqual(retry.command_ids,a.command_ids);
 for(const c of a.commands){assert.equal((await s.automation.dispatch(c.id)).command.status,'QUEUED');assert.equal((await s.automation.dispatch(c.id)).reason,'ALREADY_PROCESSED');}
 const claimed=await s.commands.claim(device);assert.equal(claimed.commands.length,4);
 for(const c of claimed.commands)await s.commands.ack({command_id:c.id,device_id:device,status:'SUCCESS',actual_state:{[c.command_type]:c.action}});
 const next=await s.automation.resolve(await s.decision());assert.equal(next.commands.length,0);assert.ok(next.skipped.every(x=>x.reason==='ALREADY_CONFIRMED'));
}finally{await s.pg.close();}});

test('freshness, policy, forged actions and offline are rejected before creating commands',async()=>{const s=await setup();try{
 const stale=await s.decision('ON',{valid_until:new Date(Date.now()-1000).toISOString()});assert.equal((await s.automation.resolve(stale)).reason,'DECISION_EXPIRED');
 const old=await s.decision();await s.decision();assert.equal((await s.automation.resolve(old)).reason,'TELEMETRY_SUPERSEDED');
 const policy=await s.decision('ON',{policy_version:999});assert.equal((await s.automation.resolve(policy)).reason,'POLICY_CHANGED');
 const bad=await s.decision('ON',{allowed_actions:{}});assert.equal((await s.automation.resolve(bad)).reason,'INVALID_SAVED_ACTIONS');
 const off=await s.decision();await s.db.query("UPDATE devices SET last_seen=now()-interval '5 minutes' WHERE id=$1",[device]);assert.equal((await s.automation.resolve(off)).reason,'DEVICE_OFFLINE');
 assert.equal((await s.db.query('SELECT count(*)::int AS n FROM device_commands'))[0].n,0);
}finally{await s.pg.close();}});

test('MANUAL override: cancel unsent AUTO, stable retry TTL, conflict detection, protect against AUTO',async()=>{const s=await setup();try{
 const a=await s.automation.resolve(await s.decision());const old=a.commands.find(c=>c.command_type==='FAN');
 const manual={device_id:device,source:'MANUAL',request_id:randomUUID(),command_type:'FAN',action:'OFF',override_minutes:5};
 const m=await s.automation.resolve(manual);assert.equal(m.commands.length,1);assert.equal((await s.commands.get(old.id)).status,'CANCELLED');
 const until=(await s.automation.overrides(device))[0].expires_at;assert.equal((await s.automation.resolve(manual)).duplicate,true);assert.deepEqual((await s.automation.overrides(device))[0].expires_at,until);
 await assert.rejects(()=>s.automation.resolve({...manual,action:'ON'}),/Request ID/);
 assert.equal((await s.automation.dispatch(m.commands[0].id)).command.status,'QUEUED');
 const b=await s.automation.resolve(await s.decision());assert.ok(b.skipped.some(x=>x.command_type==='FAN'&&x.reason==='MANUAL_OVERRIDE'));
}finally{await s.pg.close();}});

test('SENT blocks contradictory MANUAL; cooldown blocks immediate new AUTO',async()=>{const s=await setup();try{
 const a=await s.automation.resolve(await s.decision());for(const c of a.commands)await s.automation.dispatch(c.id);const claimed=await s.commands.claim(device);
 const m=await s.automation.resolve({device_id:device,source:'MANUAL',request_id:randomUUID(),command_type:'FAN',action:'OFF',override_minutes:5});assert.equal(m.commands.length,0);assert.equal(m.skipped[0].reason,'AWAITING_ACK');assert.equal((await s.automation.overrides(device)).length,0);
 for(const c of claimed.commands)await s.commands.ack({device_id:device,command_id:c.id,status:'SUCCESS',actual_state:{[c.command_type]:c.action}});
 const b=await s.automation.resolve(await s.decision('OFF'));assert.ok(b.skipped.some(x=>x.command_type==='FAN'&&x.reason==='COOLDOWN'));
}finally{await s.pg.close();}});

test('dispatch rechecks latest telemetry; expired commands never queue',async()=>{const s=await setup();try{
 const a=await s.automation.resolve(await s.decision());await s.decision();assert.equal((await s.automation.dispatch(a.commands[0].id)).reason,'TELEMETRY_SUPERSEDED');
 const c=a.commands[1];await s.db.query("UPDATE device_commands SET requested_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[c.id]);assert.equal((await s.automation.dispatch(c.id)).command.status,'TIMED_OUT');
}finally{await s.pg.close();}});

test('HTTP DTO + simulator: AUTO â†’ resolve â†’ guarded dispatch â†’ claim â†’ ACK',async()=>{const s=await setup();let app;try{
 class M{};app=await NestFactory.create({module:M,controllers:[ApiController,AutomationController],providers:[{provide:DataSource,useValue:s.db},DeviceService,TelemetryService,CommandsService,DashboardService,IncidentReportService,AutomationService]},{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:true}));await app.listen(0,'127.0.0.1');const url=await app.getUrl();
 async function post(p,b){const r=await fetch(url+'/api/'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const v=await r.json();assert.equal(r.ok,true,JSON.stringify(v));return v;}
 const a=await post('automation/resolve',{...await s.decision(),actions:{FAN:'OFF'}});assert.equal(a.commands.find(x=>x.command_type==='FAN').action,'ON');
 for(const c of a.commands)await post(`automation/commands/${c.id}/dispatch`,{});
 const {pathToFileURL}=require('node:url');const path=require('node:path');const {Simulator}=await import(pathToFileURL(path.resolve(__dirname,'../../simulator/src/engine.js')).href);const sim=new Simulator();sim.update({mode:'http',claim_url:url+'/api/commands/claim',ack_url:url+'/api/commands/ack'});await sim.poll();assert.equal(sim.devices.FAN,'ON');assert.equal(sim.counters.acks,4);
 assert.equal((await s.commands.get(a.commands[0].id)).status,'ACK');
 const bad=await fetch(url+'/api/automation/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({device_id:device,source:'MANUAL',request_id:randomUUID(),command_type:'FAN',action:'ON',override_minutes:0})});assert.equal(bad.status,400);
}finally{if(app)await app.close();await s.pg.close();}});

test('WF02 adaptive decisions → stored levels → guarded dispatch → simulator ACK', async () => {
 const s = await setup();
 const workflow = require('../../n8n-workflows/02_AI_DECISION_ENGINE_V3.json');
 function code(name, input, outputs = {}) {
   const node = workflow.nodes.find(n => n.name === name);
   const lookup = key => ({ first: () => ({ json: outputs[key] }) });
   return new Function('$json', '$', node.parameters.jsCode)(input, lookup).json;
 }
 const run = randomUUID(), start = Date.now();
 const policy = await s.devices.policy('A101');
 const config = { max_age_seconds:120, max_observation_gap_seconds:20, co2_critical_ppm:2000,
   humidity_critical_percent:90, ai_enabled:false };
 let app;
 try {
   for (const [index, temperature] of [28.2, 28.5, 29].entries()) {
     await s.telemetry.create({device_id:device, event_id:randomUUID(), run_id:run, sequence:index,
       observed_at:new Date(start-(2-index)*10000).toISOString(), temperature,
       humidity:80, light_percent:10, occupancy_count:4, co2_ppm:720, power_w:400, door_open:false});
   }
   const rows = await s.telemetry.list(device);
   const states = await s.db.query('SELECT * FROM device_states WHERE device_id=$1',[device]);
   const make = (samples, weather, overrides = {}) => {
     const t = samples[0], envelope = body => ({statusCode:200,body});
     const previous = overrides.previous || [];
     const context = code('Build Decision Context', null, {
       'Validate Decision Input': {input:{device_id:device,telemetry_id:t.id,event_id:t.event_id},config,room:'A101'},
       'Get Dashboard Context':envelope({devices:[{id:device,code:'ESP32_A101',room_code:'A101',states}],decisions:previous}),
       'Get Active Proposals':envelope([]),'Get Active Policy':envelope(policy),'Get Recent Telemetry':envelope(samples),
       'Get Outdoor Weather':envelope(weather)
     });
     return code('Finalize Decision',code('AI Gate and Cache',context)).decision_payload;
   };
   const dry = {source:'demo-dry',dew_point:15,observed_at:new Date().toISOString()};
   const wet = {...dry,source:'demo-humid',dew_point:28};
   const decision = make(rows,dry);
   assert.equal(decision.evidence.weather.strategy,'ventilate');
   assert.deepEqual(decision.evidence.actuator_levels,{FAN:3,LIGHT:80});
   assert.equal(decision.actions.VENTILATION,'ON');
   assert.equal(decision.actions.DEHUMIDIFIER,'OFF');
   const humid = make(rows,wet);
   assert.equal(humid.actions.VENTILATION,'OFF');
   assert.equal(humid.actions.DEHUMIDIFIER,'ON');
   for (const unavailable of [null, {...dry,observed_at:'2020-01-01T00:00:00Z'}]) {
     assert.equal(make(rows,unavailable).evidence.weather.source,'unavailable');
     assert.equal(make(rows,unavailable).actions.DEHUMIDIFIER,'ON');
   }
   assert.equal(make(rows.map(t=>({...t,co2_ppm:2200})),wet).actions.VENTILATION,'ON');
   assert.equal(make(rows.map(t=>({...t,humidity:95})),dry).actions.DEHUMIDIFIER,'ON');
   assert.equal(make(rows.map(t=>({...t,occupancy_count:0})),dry).actions.FAN,'OFF');
   const declining = rows.map((t,i)=>({...t,temperature:30.5+i}));
   assert.equal(make(declining,dry).evidence.actuator_levels.FAN,1);

   class M {}
   app=await NestFactory.create({module:M,controllers:[ApiController,AutomationController],
     providers:[{provide:DataSource,useValue:s.db},DeviceService,TelemetryService,CommandsService,
       DashboardService,IncidentReportService,AutomationService]},{logger:false});
   app.setGlobalPrefix('api');
   await app.listen(0,'127.0.0.1');
   const base=(await app.getUrl())+'/api/';
   const saved=await s.telemetry.decision(decision);
   const request={source:'AUTO',device_id:device,decision_id:saved.id};
   const result=await s.automation.resolve(request);
   for(const c of result.commands) await s.automation.dispatch(c.id);
   const {Simulator}=await import('../../simulator/src/engine.js');
   const sim=new Simulator();
   sim.update({mode:'http',claim_url:base+'commands/claim',ack_url:base+'commands/ack'});
   await sim.poll();
   assert.equal(sim.counters.acks,4);
   assert.deepEqual(sim.levels,{FAN:3,LIGHT:80});
   assert.equal(sim.devices.VENTILATION,'ON');
   assert.equal((await s.automation.resolve(request)).duplicate,true);
   const confirmed=await s.db.query('SELECT actual_level FROM device_states WHERE device_id=$1 AND command_type=$2',[device,'LIGHT']);
   assert.equal(confirmed[0].actual_level,80);
 } finally { if(app) await app.close(); await s.pg.close(); }
});

test('Open-Meteo adapter coalesces reads, rejects stale weather and survives provider errors',async()=>{
 const {OutdoorWeather}=require('../dist/modules/automation/outdoor-weather');
 const old=process.env.WEATHER_MODE;process.env.WEATHER_MODE='live';
 try{
   let count=0; const now=Math.floor(Date.now()/1000);
   const good=new OutdoorWeather(async url=>{
     count++;assert.equal(url.searchParams.get('current'),'dew_point_2m');
     return Response.json({current:{time:now,dew_point_2m:18.4}});
   });
   const values=await Promise.all([good.read(),good.read(),good.read()]);
   assert.equal(values[0].dew_point,18.4);await good.read();assert.equal(count,1);
   for(const fetcher of [async()=>Response.json({current:{time:now-7200,dew_point_2m:23}}),
       async()=>Response.json({current:{time:now,dew_point_2m:null}}),async()=>{throw Error('offline')}]) {
     assert.equal((await new OutdoorWeather(fetcher).read()).source,'unavailable');
   }
 }finally{if(old===undefined)delete process.env.WEATHER_MODE;else process.env.WEATHER_MODE=old;}
});
