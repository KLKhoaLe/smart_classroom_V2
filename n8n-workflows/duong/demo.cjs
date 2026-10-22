// Run from repository root. This writes labelled SIMULATED telemetry into the local DB.
const {randomUUID}=require('node:crypto');
const {evaluate}=require('../../backend/dist/modules/duong-monitoring/evaluate');
const base=process.env.MONITORING_BACKEND_URL||'http://127.0.0.1:3001/api';
const n8n=process.env.MONITORING_N8N_URL||'http://127.0.0.1:5678';
const args=process.argv.slice(2),which=args[args.indexOf('--case')+1];
const backendOnly=args.includes('--backend-only');
const presets={environment:7,energy:8,security:9};
async function request(url,body,token){
 const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 const text=await r.text();if(!r.ok)throw new Error(`HTTP ${r.status} ${url}: ${text}`);
 try{return JSON.parse(text);}catch{throw new Error('Phản hồi không phải JSON: '+text.slice(0,200));}
}
(async()=>{
 if(!presets[which])throw new Error('Dùng --case environment hoặc energy hoặc security. Thêm --backend-only chỉ để thử API; không tính là thử n8n.');
 const flow=presets[which],run=randomUUID();
 console.log(backendOnly?'MODE: API_ONLY — KHÔNG chạy n8n':'MODE: N8N_WEBHOOK — cần import và Publish workflow');
 console.log('Ghi telemetry mô phỏng vào backend local. Dừng simulator đang phát cho ESP32_A101 để kết quả dễ đối chiếu.');
 const count=which==='environment'?6:which==='energy'?7:5;
 let last;
 for(let i=0;i<count;i++){
  if(i)await new Promise(r=>setTimeout(r,10000));
  const payload={device_id:'ESP32_A101',event_id:randomUUID(),run_id:run,sequence:i,
   observed_at:new Date().toISOString(),simulated:true,temperature:27,humidity:50,co2_ppm:600,light_percent:50,
   power_w:600,occupancy_count:0,door_open:false};
  if(which==='environment'&&i<4)Object.assign(payload,{temperature:38,humidity:85,co2_ppm:1800});
  if(which==='energy')payload.occupancy_count=(i===0||i>=5)?1:0;
  if(which==='security')payload.door_open=i<2;
  const saved=await request(base+'/telemetry',payload,process.env.API_TOKEN);
  const id=saved.telemetry?.id;if(!id)throw new Error('Backend không trả telemetry.id.');
  async function execute(){
   if(!backendOnly)return request(n8n+'/webhook/duong-monitoring-'+String(flow).padStart(2,'0'),{telemetry_id:id},process.env.N8N_DEMO_TOKEN);
   const c=await request(base+`/duong-monitoring/context/${flow}/`+id,undefined,process.env.API_TOKEN);
   return request(base+'/duong-monitoring/commit',{flow,telemetry_id:id,context_hash:c.context_hash,evaluation:evaluate(c,flow)},process.env.API_TOKEN);
  }
  let out=await execute();out=Array.isArray(out)?out[0]:out;out=out?.json??out;last=out;
  if(!out?.status)throw new Error('Workflow chưa trả kết quả đánh giá; kiểm tra Executions.');
  console.log(JSON.stringify({sample:i,telemetry_id:id,created:out.created,status:out.status,observations:out.observations,
   proposals:out.proposals,events:out.new_events,email_status:out.email_status},null,2));
  if(i===count-1){const repeat=await execute();console.log('Gửi lại cùng telemetry_id, kỳ vọng created:false và không có new_events:',JSON.stringify(repeat));}
 }
 const status=await request(base+'/duong-monitoring/status/ESP32_A101',undefined,process.env.API_TOKEN);
 console.log('Đã lưu trạng thái:',JSON.stringify(status.states.find(x=>x.flow===flow),null,2));
 if(which==='security'&&last.observations.within_schedule)console.log('Đang TRONG lịch thật: không phát cảnh báo là đúng. Test ngoài giờ khi ngoài lịch 08:00–17:00; test tự động đã kiểm tra cả hai nhánh.');
 console.log('Chưa nối WF03/WF10: proposal/event đã lưu không có nghĩa command/incident đã được tạo.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
