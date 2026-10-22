import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Simulator } from './engine.js';
import { defaults } from './model.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.DATA_DIR||resolve(root,'data');mkdirSync(dataDir,{recursive:true});
const configFile=resolve(dataDir,'config.json');let config=defaults();
if(existsSync(configFile)){try{config=JSON.parse(readFileSync(configFile,'utf8'));}catch(e){console.error('config.json không đọc được. Hãy sửa hoặc đổi tên file:',e.message);process.exit(1);}}
const persist=c=>{writeFileSync(configFile+'.tmp',JSON.stringify(c,null,2));renameSync(configFile+'.tmp',configFile);};
const sim=new Simulator({config,persist});
const timer=setInterval(()=>sim.tick().catch(e=>sim.log('error',e.message)),250);
function json(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));}
async function body(req){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw new Error('Payload vượt 64 KB.');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
const assets={'/':'index.html','/app.js':'app.js','/demo-ui.js':'demo-ui.js','/styles.css':'styles.css'};
const mime={html:'text/html',js:'text/javascript',css:'text/css'};
const server=http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='GET'&&Object.hasOwn(assets,path)){const name=assets[path];res.writeHead(200,{'content-type':mime[name.split('.').pop()]+'; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});res.end(readFileSync(resolve(root,'public',name)));return;}
  if(req.method==='GET'&&path==='/api/health'){json(res,200,{ok:true,service:'smart-classroom-simulator'});return;}
  if(req.method==='GET'&&path==='/api/state'){json(res,200,sim.snapshot());return;}
  if(req.method==='GET'&&path==='/api/logs/export'){res.setHeader('Content-Disposition','attachment; filename="simulator-logs.json"');json(res,200,{exported_at:new Date().toISOString(),run_id:sim.runId,logs:sim.logs});return;}
  if(req.method!=='POST'){json(res,404,{error:'Không tìm thấy endpoint.'});return;}
  // Browser writes must be same-origin. Server-to-server requests carry no Origin.
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`){json(res,403,{error:'Origin không được phép.'});return;}
  if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:'Cần Content-Type: application/json'});return;}
  if(path==='/api/commands'&&process.env.COMMAND_TOKEN&&!equal(String(req.headers.authorization||''),`Bearer ${process.env.COMMAND_TOKEN}`)){json(res,401,{error:'Sai COMMAND_TOKEN.'});return;}
  const b=await body(req);
  if(path==='/api/config'){json(res,200,sim.update(b));return;}
  if(path==='/api/run'){sim.action(b.action);json(res,200,sim.snapshot());return;}
  if(path==='/api/scenario'){sim.applyScenario(b.id);json(res,200,sim.snapshot());return;}
  if(path==='/api/send'){json(res,200,await sim.telemetry(b.duplicate===true));return;}
  if(path==='/api/send-invalid'){const payload={...(sim.lastPayload||sim.sample()),event_id:randomUUID(),temperature:999};json(res,200,{delivered:await sim.send('Invalid telemetry',sim.config.telemetry_url,payload),payload});return;}
  if(path==='/api/heartbeat'){json(res,200,{delivered:await sim.heartbeat()});return;}
  if(path==='/api/commands'){json(res,200,await sim.command(b));return;}
  if(path==='/api/local-command'){
   if(sim.config.mode!=='preview'){json(res,409,{error:'Lệnh thử nội bộ chỉ dùng trong chế độ Xem trước. Dùng n8n khi bật HTTP.'});return;}
   json(res,200,await sim.command({command_id:randomUUID(),device_id:sim.config.device_id||sim.config.device_code,command_type:b.command_type,action:b.action}));return;
  }
  if(path==='/api/logs/clear'){sim.logs=[];json(res,200,{ok:true});return;}
  json(res,404,{error:'Không tìm thấy endpoint.'});
 }catch(e){json(res,400,{error:e.message});}
});
server.requestTimeout=15000;
server.listen(Number(process.env.PORT||4310),process.env.HOST||'127.0.0.1',()=>console.log(`\nSmart Classroom Simulator\nMở http://localhost:${server.address().port}\nCtrl+C để dừng. Phiên luôn khởi động ở trạng thái STOPPED.\n`));
function close(){sim.closing=true;clearInterval(timer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),12000).unref();}
process.on('SIGINT',close);process.on('SIGTERM',close);
