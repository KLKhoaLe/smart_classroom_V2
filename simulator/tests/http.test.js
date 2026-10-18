import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
const root=fileURLToPath(new URL('../',import.meta.url));
async function launch(data) {
 const child=spawn(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:data,COMMAND_TOKEN:'test-secret',OUTBOUND_TOKEN:''},stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{
  let out='';const timer=setTimeout(()=>{child.kill();reject(new Error('Server startup timeout'));},6000);
  child.stdout.on('data',c=>{out+=c;const match=out.match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.stderr.on('data',c=>{out+=c;});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exit ${code}: ${out}`));});
 });
 return {url,child,stop:async()=>{if(child.exitCode===null){const end=once(child,'exit');child.kill('SIGTERM');await end;}}};
}
test('real HTTP: static UI, telemetry, heartbeat, command/ACK, token, config restart', {timeout:20000},async()=>{
 const data=mkdtempSync(join(tmpdir(),'classroom-test-'));const received=[];
 const receiver=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;received.push({path:req.url,data:JSON.parse(raw)});res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');});
 await new Promise(r=>receiver.listen(0,'127.0.0.1',r));let app;
 try {
  app=await launch(data);const target=`http://127.0.0.1:${receiver.address().port}`;
  const post=async(path,b,headers={})=>fetch(app.url+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(b)});
  const html=await (await fetch(app.url)).text();assert.match(html,/Phòng thí nghiệm IoT/);
  for(const asset of ['/app.js','/styles.css'])assert.equal((await fetch(app.url+asset)).status,200);
  assert.equal((await post('/api/config',{mode:'http',telemetry_url:target+'/t',heartbeat_url:target+'/h',ack_url:target+'/a',sensors:{temperature:34,occupancy_count:5}})).status,200);
  assert.equal((await (await post('/api/send',{})).json()).delivered,true);
  assert.equal((await (await post('/api/heartbeat',{})).json()).delivered,true);
  assert.equal(received[0].data.temperature,34);assert.equal(received[0].data.occupancy,true);assert.equal(received[1].path,'/h');
  const cmd={command_id:'http-command',device_id:'ESP32_A101',command_type:'FAN',action:'ON'};
  assert.equal((await post('/api/commands',cmd)).status,401);
  const auth={authorization:'Bearer test-secret'};
  const ack=await (await post('/api/commands',cmd,auth)).json();assert.equal(ack.status,'SUCCESS');assert.equal(received[2].path,'/a');assert.equal(received[2].data.fan_state,'ON');
  assert.equal((await (await fetch(app.url+'/api/state')).json()).devices.FAN,'ON');
  assert.equal((await (await post('/api/commands',cmd,auth)).json()).duplicate,true);
  assert.equal((await post('/api/config',{}, {origin:'https://not-this-app.test'})).status,403);
  assert.equal((await post('/api/config',{sensors:{humidity:200}})).status,400);
  await app.stop();app=await launch(data);
  const state=await (await fetch(app.url+'/api/state')).json();assert.equal(state.config.sensors.temperature,34);assert.equal(state.status,'stopped');assert.equal(state.devices.FAN,'OFF');
 }finally{if(app)await app.stop();await new Promise(r=>receiver.close(r));rmSync(data,{recursive:true,force:true});}
});
