import {existsSync,copyFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const [from,to] of [['.env.example','.env'],['backend/.env.example','backend/.env'],['frontend/.env.example','frontend/.env.local'],['simulator/.env.example','simulator/.env']]){
 const dest=resolve(root,to);if(!existsSync(dest)){copyFileSync(resolve(root,from),dest);console.log('Created '+to);}else console.log('Keep existing '+to);
}
const {defaults}=await import('../simulator/src/model.js');
const dir=resolve(root,'simulator/data');mkdirSync(dir,{recursive:true});
const file=resolve(dir,'config.json');
if(!existsSync(file)){writeFileSync(file,JSON.stringify({...defaults(),mode:'preview',telemetry_url:'http://127.0.0.1:3001/api/telemetry',heartbeat_url:'http://127.0.0.1:3001/api/devices/heartbeat',ack_url:'http://127.0.0.1:3001/api/commands/ack',claim_url:'http://127.0.0.1:3001/api/commands/claim'},null,2));console.log('Created simulator config: preview, backend URLs ready. Switch HTTP in UI when backend is ready.');}
console.log('\nNext: npm run install:all -> npm run db:up -> npm run db:migrate -> npm run db:seed\nRun 3 terminals: dev:backend, dev:frontend, dev:simulator.');
