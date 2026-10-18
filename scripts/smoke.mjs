// Creates one TEST command; no AI or n8n, no physical device.
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const env=fileURLToPath(new URL('../backend/.env',import.meta.url));
if(existsSync(env))process.loadEnvFile(env);
const base=process.env.BACKEND_URL||'http://127.0.0.1:3001';
async function api(path,body){const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(process.env.API_TOKEN?{authorization:'Bearer '+process.env.API_TOKEN}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});const b=await r.json();if(!r.ok)throw new Error(JSON.stringify(b));return b;}
try{
 console.log('Health:',await api('health'));
 const result=await api('commands',{device_id:'ESP32_A101',command_type:'FAN',action:'ON',source:'TEST',idempotency_key:randomUUID(),ttl_seconds:60});
 const id=result.command.command_id;console.log('Created TEST command:',id);
 console.log('Queued:',(await api(`commands/${id}/dispatch`,{})).status);
 console.log('Simulator phải ở HTTP và RUNNING/PAUSED để claim. Chờ tối đa 15s...');
 for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,1000));const c=await api(`commands/${id}/status`);if(c.status==='ACK'){console.log('PASS: command -> claim -> ACK. FAN ON đã xác nhận.');process.exit(0);}if(['FAILED','TIMED_OUT'].includes(c.status))throw new Error('Command '+c.status);}
 throw new Error('Chưa thấy ACK. Kiểm tra simulator HTTP/Start, claim_url, ack_url và log.');
}catch(e){console.error(e.message);process.exitCode=1;}
