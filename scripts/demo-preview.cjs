const {randomUUID}=require('node:crypto');
const {PGlite}=require('../backend/node_modules/@electric-sql/pglite');
const {NestFactory}=require('../backend/node_modules/@nestjs/core');
const {ValidationPipe}=require('../backend/node_modules/@nestjs/common');
const {DataSource}=require('../backend/node_modules/typeorm');
const {InitialSchema1792200000000}=require('../backend/dist/database/migrations/1792200000000-InitialSchema');
const {AutomationRunsV31792398000000}=require('../backend/dist/database/migrations/1792398000000-AutomationRunsV3');
const {IncidentsReportsV11792500000000}=require('../backend/dist/database/migrations/1792500000000-IncidentsReportsV1');
const {seed}=require('../backend/dist/database/seed');
const {ApiController}=require('../backend/dist/modules/api.controller');
const {DeviceService}=require('../backend/dist/modules/device.service');
const {TelemetryService}=require('../backend/dist/modules/telemetry.service');
const {CommandsService}=require('../backend/dist/modules/commands.service');
const {DashboardService}=require('../backend/dist/modules/dashboard.service');
const {IncidentReportService}=require('../backend/dist/modules/incident-report.service');

function wrap(pg){return {query:async(sql,args)=>{if(args===undefined)return (await pg.exec(sql)).at(-1)?.rows||[];const r=await pg.query(sql,args);return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows??0]:r.rows;},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))};}
async function main(){
 const pg=new PGlite(),db=wrap(pg);let app;
 try{
  await new InitialSchema1792200000000().up(db);await new AutomationRunsV31792398000000().up(db);await new IncidentsReportsV11792500000000().up(db);await seed(db);
  const devices=new DeviceService(db),telemetry=new TelemetryService(db,devices),commands=new CommandsService(db,devices),dashboard=new DashboardService(db),records=new IncidentReportService(db);
  const now=new Date().toISOString();
  await telemetry.create({device_id:'ESP32_A101',event_id:randomUUID(),run_id:randomUUID(),sequence:1,observed_at:now,temperature:34,humidity:72,light_percent:45,occupancy_count:24,co2_ppm:1250,power_w:850,door_open:false,simulated:true});
  await records.upsertIncident({device_id:'ESP32_A101',type:'HIGH_TEMPERATURE',severity:'CRITICAL',title:'Nhiệt độ phòng vượt ngưỡng',details:{temperature:34,threshold:30,source:'demo-preview'}});
  await records.upsertIncident({device_id:'ESP32_A101',type:'HIGH_CO2',severity:'WARNING',title:'CO₂ cao khi lớp đang hoạt động',details:{co2_ppm:1250,occupancy_count:24,source:'demo-preview'}});
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await records.aggregateDaily('A101',date);
  await records.saveReport({room:'A101',type:'WEEKLY',period_start:new Date(Date.now()-7*86400000).toISOString(),period_end:now,status:'DRAFT',summary:'Đề xuất demo: tăng thông gió khi CO₂ duy trì trên 1.000 ppm; chờ người dùng duyệt.',metrics:{estimated_kwh:42.6,avg_temperature:29.4,avg_humidity:64,avg_co2_ppm:980,telemetry_count:760,online_seconds:3780,incident_count:3,recommendations:[{action:'Tăng thông gió theo ngưỡng CO₂',reason:'CO₂ cao trong thời gian có người',evidence:{avg_co2_ppm:980}}],generated_by:'demo-preview'}});
  class PreviewModule{}
  app=await NestFactory.create({module:PreviewModule,controllers:[ApiController],providers:[{provide:DataSource,useValue:db},DeviceService,TelemetryService,CommandsService,DashboardService,IncidentReportService]},{logger:false});
  app.setGlobalPrefix('api');app.enableCors({origin:'http://localhost:3000'});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:true}));
  await app.listen(3001,'127.0.0.1');console.log('PGlite preview API ready at http://localhost:3001/api (in-memory data; stop to discard)');
  const stop=async()=>{await app.close();await pg.close();process.exit(0);};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }catch(e){if(app)await app.close();await pg.close();throw e;}
}
main().catch(e=>{console.error(e);process.exit(1);});
