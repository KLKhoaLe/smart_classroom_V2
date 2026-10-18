import { randomUUID } from 'node:crypto';
import { defaults, initialSensors, initialDevices, scenarios, validateConfig } from './model.js';
export class Simulator {
 constructor({config=defaults(), persist=()=>{}, fetcher=fetch, clock=Date.now}={}) {
  this.config=validateConfig(config,defaults());this.persist=persist;this.fetcher=fetcher;this.clock=clock;
  this.status='stopped';this.runId=randomUUID();this.sequence=0;this.logs=[];this.history=[];this.devices=initialDevices();
  this.commands=new Map();this.deviceSequences={};this.pendingAcks=new Map();this.inflight=new Set();this.counters={generated:0,sent:0,errors:0,commands:0,acks:0};
  this.lastPayload=null;this.lastHeartbeat=0;this.lastTelemetry=0;this.lastPoll=0;this.startedAt=clock();this.scenario='custom';this.timelineStart=null;this.timelineStep=-1;this.closing=false;
 }
 log(type,message,data=null) {this.logs.unshift({id:randomUUID(),time:new Date(this.clock()).toISOString(),type,message,data});this.logs=this.logs.slice(0,150);}
 update(patch) {
  if(this.inflight.size)throw new Error('Đang có request xử lý, chờ một chút rồi lưu lại.');
  if(this.status!=='stopped'&&['device_id','device_code','room_code'].some(k=>k in patch&&patch[k]!==this.config[k]))throw new Error('Dừng phiên trước khi đổi phòng hoặc thiết bị.');
  const identityChanged=['device_id','device_code','room_code'].some(k=>k in patch&&patch[k]!==this.config[k]);
  const next=validateConfig(patch,this.config);this.persist(next);this.config=next;
  if(identityChanged){this.devices=initialDevices();this.deviceSequences={};this.commands.clear();this.pendingAcks.clear();this.runId=randomUUID();this.sequence=0;this.lastPayload=null;}
  if(patch.sensors){this.scenario='custom';this.timelineStart=null;}
  this.log('info','Đã cập nhật cấu hình.');return this.snapshot();
 }
 action(action) {
  if(action==='start') {if(this.status==='stopped'){this.runId=randomUUID();this.sequence=0;this.lastPayload=null;}this.status='running';this.lastTelemetry=0;this.lastHeartbeat=0;this.log('info','Bắt đầu phát dữ liệu.');}
  else if(action==='pause') {this.status='paused';this.timelineStart=null;this.log('info','Tạm dừng telemetry; heartbeat và nhận lệnh vẫn hoạt động.');}
  else if(action==='stop') {this.status='stopped';this.timelineStart=null;this.log('info','Đã dừng các chu kỳ. Request đã gửi có thể hoàn tất; vẫn nhận lệnh HTTP trực tiếp.');}
  else throw new Error('Thao tác không hợp lệ.');
 }
 applyScenario(id) {
  const s=scenarios.find(x=>x.id===id);if(!s)throw new Error('Không tìm thấy kịch bản.');
  this.update({sensors:{...initialSensors(),...(s.values||{})}});this.scenario=id;
  if(s.timeline){this.action('start');this.timelineStart=this.clock();this.timelineStep=-1;}
  this.log('info',`Kịch bản: ${s.name}`);
 }
 sample() {
  const s={...this.config.sensors};
  if(this.config.jitter){s.temperature=+(s.temperature+(Math.random()-.5)*.4).toFixed(1);s.temperature=Math.max(-10,Math.min(60,s.temperature));s.humidity=Math.max(0,Math.min(100,Math.round(s.humidity+(Math.random()-.5)*2)));}
  return {schema_version:2,event_id:randomUUID(),run_id:this.runId,sequence:++this.sequence,observed_at:new Date(this.clock()).toISOString(),simulated:true,
   device_id:this.config.device_id||this.config.device_code,device_code:this.config.device_code,room:this.config.room_code,room_code:this.config.room_code,
   ...s,occupancy:s.occupancy_count>0,light_raw:Math.round((100-s.light_percent)*4095/100),actual_state:{...this.devices}};
 }
 async send(kind,url,payload) {
  if(this.config.faults.offline){this.log('warning',`OFFLINE giả lập: bỏ ${kind}.`);return false;}
  if(this.config.mode==='preview'){this.log('preview',`${kind}: chỉ xem trước, chưa gửi ra ngoài.`,payload);return true;}
  if(!url){this.log('warning',`Chưa cấu hình URL cho ${kind}.`);return false;}
  for(let attempt=1;attempt<=2;attempt++) {
   try {
    const response=await this.fetcher(url,{method:'POST',headers:{'content-type':'application/json',...(process.env.OUTBOUND_TOKEN?{authorization:`Bearer ${process.env.OUTBOUND_TOKEN}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok){const err=new Error(`HTTP ${response.status}`);err.retry=response.status===429||response.status>=500;await response.body?.cancel();throw err;}
    await response.body?.cancel();this.counters.sent++;this.log('success',`${kind}: HTTP ${response.status} (đích đã nhận HTTP, chưa chứng minh xử lý xong).`,payload);return true;
   } catch(err) {
    if(attempt===2||err.retry===false){this.counters.errors++;this.log('error',`${kind} thất bại: ${err.message}`,{event_id:payload.event_id,command_id:payload.command_id});return false;}
    this.log('warning',`${kind}: thử lại lần 2, giữ nguyên ID.`);
   }
  }
 }
 async exclusive(key,fn) {if(this.inflight.has(key))return {skipped:true};this.inflight.add(key);try{return await fn();}finally{this.inflight.delete(key);}}
 async telemetry(duplicate=false) {return this.exclusive('telemetry',async()=>{
  if(duplicate&&!this.lastPayload)throw new Error('Chưa có bản tin để gửi lại.');
  const payload=duplicate?structuredClone(this.lastPayload):this.sample();this.lastPayload=payload;this.counters.generated++;
  this.history.push({time:payload.observed_at,temperature:payload.temperature,humidity:payload.humidity});this.history=this.history.slice(-40);
  const delivered=await this.send(duplicate?'Telemetry trùng ID':'Telemetry',this.config.telemetry_url,payload);return {delivered,mode:this.config.mode,payload};
 });}
 async heartbeat(){return this.exclusive('heartbeat',()=>this.send('Heartbeat',this.config.heartbeat_url,{device_id:this.config.device_id||this.config.device_code,device_code:this.config.device_code,room:this.config.room_code,run_id:this.runId,observed_at:new Date(this.clock()).toISOString(),uptime_ms:this.clock()-this.startedAt,simulated:true}));}
 async deliverAck(ack) {
  if(this.config.faults.drop_ack){this.log('warning','Cố ý bỏ ACK để kiểm thử timeout.',ack);return;}
  this.pendingAcks.set(ack.command_id,{ack,attempts:0,next:0});await this.flushAcks();
 }
 async flushAcks(){return this.exclusive('acks',async()=>{
  for(const [id,item] of this.pendingAcks){if(item.next>this.clock())continue;
   const ok=await this.send('ACK',this.config.ack_url,item.ack);
   if(ok){this.pendingAcks.delete(id);this.counters.acks++;}
   else {item.attempts++;item.next=this.clock()+5000;if(item.attempts>=3){this.pendingAcks.delete(id);this.log('error','ACK chưa gửi được sau 3 vòng; tra log và gửi lại command cùng ID.',item.ack);}}
  }
 });}
 async command(input) {
  if(this.config.faults.offline)throw new Error('Thiết bị đang OFFLINE giả lập.');
  let c=input;
  if(typeof c?.mqtt_payload==='string')c=JSON.parse(c.mqtt_payload);
  if(!c||typeof c!=='object'||typeof c.command_id!=='string'||!c.command_id||c.command_id.length>150)throw new Error('Thiếu command_id hợp lệ.');
  const allowed=[this.config.device_code,this.config.device_id].filter(Boolean);
  if(!allowed.includes(c.device_id)&&!allowed.includes(c.device_code))throw new Error('Lệnh không dành cho thiết bị đang mô phỏng.');
  const fingerprint=JSON.stringify([c.device_id,c.device_code,c.command_type,c.action,c.sequence,c.expires_at]);
  if(this.commands.has(c.command_id)) {
   const old=this.commands.get(c.command_id);if(old.fingerprint!==fingerprint)throw new Error('command_id đã tồn tại nhưng nội dung khác.');
   this.log('info','Lệnh trùng: không thực thi lại, gửi lại ACK đã lưu.');await this.deliverAck(old.ack);return {...old.ack,duplicate:true};
  }
  let reason='';const type=c.command_type;
  if(!Object.hasOwn(this.devices,type))reason='command_type không được hỗ trợ';
  else if(!['ON','OFF'].includes(c.action))reason='action phải là ON hoặc OFF';
  else if(c.expires_at&&(!Number.isFinite(Date.parse(c.expires_at))||Date.parse(c.expires_at)<=this.clock()))reason='Lệnh hết hạn hoặc expires_at sai';
  else if(c.sequence!==undefined&&(!Number.isSafeInteger(c.sequence)||c.sequence<0))reason='sequence không hợp lệ';
  else if(c.sequence!==undefined&&c.sequence<=(this.deviceSequences[type]??-1))reason='Lệnh cũ: sequence không lớn hơn lệnh đã thực thi';
  else if(this.config.faults.fail_command)reason='Thiết bị giả lập lỗi thực thi';
  if(!reason){this.devices[type]=c.action;if(c.sequence!==undefined)this.deviceSequences[type]=c.sequence;}
  const ack={command_id:c.command_id,device_id:c.device_id||this.config.device_id||this.config.device_code,device_code:this.config.device_code,
   status:reason?'FAILED':'SUCCESS',result:reason?'FAILED':'SUCCESS',message:reason||`${type} set to ${c.action}`,command_type:type,
   actual_state:{...this.devices},fan_state:this.devices.FAN,light_state:this.devices.LIGHT,sequence:c.sequence??null,observed_at:new Date(this.clock()).toISOString(),simulated:true};
  // Cache before first await, so concurrent deliveries cannot execute twice.
  this.commands.set(c.command_id,{fingerprint,ack});if(this.commands.size>1000)this.commands.delete(this.commands.keys().next().value);
  this.counters.commands++;this.log(reason?'error':'command',reason||`${type} → ${c.action}`,ack);await this.deliverAck(ack);return ack;
 }
 async poll(){return this.exclusive('poll',async()=>{
  if(this.config.mode!=='http'||!this.config.claim_url||this.config.faults.offline)return;
  try {
   const r=await this.fetcher(this.config.claim_url,{method:'POST',headers:{'content-type':'application/json',...(process.env.OUTBOUND_TOKEN?{authorization:`Bearer ${process.env.OUTBOUND_TOKEN}`}:{})},body:JSON.stringify({device_id:this.config.device_id||this.config.device_code,device_code:this.config.device_code,run_id:this.runId}),signal:AbortSignal.timeout(5000),redirect:'error'});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);if(r.status===204)return;
   const body=await r.json();const items=Array.isArray(body)?body:body.commands;
   if(!Array.isArray(items))throw new Error('Claim phải trả {commands: []} hoặc mảng.');
   for(const c of items.slice(0,20)){try{await this.command(c);}catch(e){this.log('error',`Bỏ lệnh claim: ${e.message}`);}}
  }catch(e){this.log('error',`Claim: ${e.message}`);this.counters.errors++;}
 });}
 async tick(){
  if(this.closing)return;
  const now=this.clock();
  if(this.status==='running'){
   if(this.timelineStart!==null){const step=Math.floor((now-this.timelineStart)/30000);
    if(step>=3){this.timelineStart=null;this.log('info','Timeline kết thúc; giữ giá trị phòng trống và tiếp tục phát.');}
    else if(step!==this.timelineStep){this.timelineStep=step;const s=scenarios.find(x=>x.id===['normal','hot','empty'][step]);this.config.sensors={...initialSensors(),...s.values};this.log('info',`Timeline ${step+1}/3: ${s.name}`);}
   }
   if(now-this.lastTelemetry>=this.config.interval_ms){this.lastTelemetry=now;void this.telemetry().catch(e=>this.log('error',e.message));}
  }
  if(this.status!=='stopped'){
   if(now-this.lastHeartbeat>=this.config.heartbeat_ms){this.lastHeartbeat=now;void this.heartbeat();}
   if(now-this.lastPoll>=this.config.poll_ms){this.lastPoll=now;void this.poll();}
  }
  if(this.pendingAcks.size)void this.flushAcks();
 }
 snapshot(){return {config:this.config,status:this.status,run_id:this.runId,sequence:this.sequence,devices:this.devices,counters:this.counters,logs:this.logs,history:this.history,last_payload:this.lastPayload,scenario:this.scenario,pending_acks:this.pendingAcks.size,busy:[...this.inflight],scenarios};}
}
