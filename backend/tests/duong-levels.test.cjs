const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs'),{resolve}=require('node:path'),{pathToFileURL}=require('node:url');
const {PGlite}=require('@electric-sql/pglite');
const {DataSource}=require('typeorm'),{NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common');
const {DeviceService}=require('../dist/modules/device.service'),{CommandsService}=require('../dist/modules/commands.service');
const {TelemetryService}=require('../dist/modules/telemetry.service'),{DashboardService}=require('../dist/modules/dashboard.service');
const {IncidentReportService}=require('../dist/modules/incident-report.service');
const {ApiController}=require('../dist/modules/api.controller');
const {AutomationService,AutomationController}=require('../dist/modules/automation/automation.module');
const {seed}=require('../dist/database/seed');
function wrap(pg){return {query:async(sql,args)=>{if(args===undefined)return (await pg.exec(sql)).at(-1)?.rows||[];const r=await pg.query(sql,args);return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows??0]:r.rows;},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))}}
const wf=JSON.parse(readFileSync(resolve(__dirname,'../../n8n-workflows/03_MASTER_AUTOMATION_V3.json'),'utf8'));
const validate=new Function('$input',wf.nodes.find(n=>n.name==='Validate Request').parameters.jsCode);
const input=b=>validate({first:()=>({json:{input:b,from_webhook:true,config:{dispatch_mode:'BACKEND'}}})})[0].json;
const request=(type,level)=>({device_id:'ESP32_A101',source:'MANUAL',request_id:randomUUID(),command_type:type,action:level===0?'OFF':'ON',level,override_minutes:5});
test('WF03 manual validation preserves levels; rejects invalid/unsupported values',()=>{
 for(const [type,level] of [['FAN',1],['FAN',3],['LIGHT',100],['LIGHT',0]]) assert.equal(input(request(type,level)).request.level,level);
 for(const [type,level] of [['FAN',4],['LIGHT',101],['LIGHT',0.5],['VENTILATION',1]])assert.equal(input(request(type,level)).eligible,false);
});
test('HTTP resolve → queue → simulator → ACK: levels persist, change while ON, invalid ACK cannot alter actual',async()=>{
 const pg=new PGlite(),db=wrap(pg);let app;try{
 for(const [file,name] of [['1792200000000-InitialSchema','InitialSchema1792200000000'],['1792300000000-VinhBackendEnhancements','VinhBackendEnhancements1792300000000'],['1792398000000-AutomationRunsV3','AutomationRunsV31792398000000'],['1792700000000-ActuatorLevels','ActuatorLevels1792700000000']])await new (require('../dist/database/migrations/'+file)[name])().up(db);
 await seed(db);await db.query('UPDATE devices SET last_seen=clock_timestamp()');
 class M{};app=await NestFactory.create({module:M,controllers:[ApiController,AutomationController],providers:[{provide:DataSource,useValue:db},DeviceService,CommandsService,TelemetryService,DashboardService,IncidentReportService,AutomationService]},{logger:false});
 app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');const base=(await app.getUrl())+'/api/';
 async function post(path,b,expected=201){const res=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const out=await res.json();assert.equal(res.status,expected,JSON.stringify(out));return out}
 const {Simulator}=await import(pathToFileURL(resolve(__dirname,'../../simulator/src/engine.js')).href);const sim=new Simulator();sim.update({mode:'http',claim_url:base+'commands/claim',ack_url:base+'commands/ack'});
 const states=async()=>{const d=await(await fetch(base+'dashboard')).json();return d.devices[0].states};
 for(const [type,level] of [['FAN',1],['FAN',3],['LIGHT',25],['LIGHT',80],['LIGHT',0]]){
  const b=input(request(type,level)).request;
  const before=(await states()).find(s=>s.command_type===type);
  const resolved=await post('automation/resolve',b);assert.equal(resolved.commands.length,1);const c=resolved.commands[0];
  assert.equal(c.level,level);assert.equal((await states()).find(s=>s.command_type===type).actual_level,before.actual_level);
  const duplicate=await post('automation/resolve',b);assert.equal(duplicate.duplicate,true);
  await post('automation/resolve',{...b,level:level===1?2:1,action:'ON'},409);
  await post(`automation/commands/${c.id}/dispatch`,{});await sim.poll();
  const after=(await states()).find(s=>s.command_type===type);assert.equal(after.actual_level,level);assert.equal(after.actual_state,level===0?'OFF':'ON');
 }
 // Missing or wrong level in ACK is rejected, even when ON matches.
 const c=(await post('automation/resolve',input(request('LIGHT',60)).request)).commands[0];await post(`automation/commands/${c.id}/dispatch`,{});await post('commands/claim',{device_id:'ESP32_A101'});
 for(const extra of [{},{actual_levels:{LIGHT:50}}])await post('commands/ack',{device_id:'ESP32_A101',command_id:c.id,status:'SUCCESS',actual_state:{LIGHT:'ON'},...extra},400);
 assert.equal((await states()).find(s=>s.command_type==='LIGHT').actual_level,0);
 await post('commands/ack',{device_id:'ESP32_A101',command_id:c.id,status:'SUCCESS',actual_state:{LIGHT:'ON'},actual_levels:{LIGHT:60}});
 assert.equal((await states()).find(s=>s.command_type==='LIGHT').actual_level,60);
 // An old WF03 dropping a frontend level cannot execute a full-power ON command.
 const intent=request('LIGHT',40);
 await db.query("INSERT INTO device_events(id,device_id,event_type,payload) VALUES($1,$2,'MANUAL_LEVEL_REQUESTED',$3::jsonb)", [intent.request_id,'20000000-0000-4000-8000-000000000001',JSON.stringify(intent)]);
 const {level:omitted,...stripped}=intent;await post('automation/resolve',stripped,409);
 // A stale dispatch cannot apply a different override level.
 const stale=(await post('automation/resolve',input(request('FAN',2)).request)).commands[0];
 await db.query("UPDATE manual_overrides SET level=1 WHERE command_type='FAN'");
 assert.equal((await post(`automation/commands/${stale.id}/dispatch`,{})).reason,'MANUAL_OVERRIDE_CHANGED');
 await post('automation/resolve',request('FAN',4),400);
 }finally{if(app)await app.close();await pg.close()}
});
