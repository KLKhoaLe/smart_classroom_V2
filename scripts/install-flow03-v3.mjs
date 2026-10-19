import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const modulePath=path.join(root,'backend/src/app.module.ts');
const commandPath=path.join(root,'backend/src/modules/commands.service.ts');
if(!fs.existsSync(modulePath)||!fs.existsSync(commandPath))throw new Error('Chạy script tại thư mục gốc smart-classroom-base.');
let app=fs.readFileSync(modulePath,'utf8');
if(!app.includes("from './modules/automation/automation.module'")){
 if(!/imports\s*:\s*\[/.test(app))throw new Error('Không tìm thấy imports của AppModule. Thêm AutomationModule thủ công.');
 app="import { AutomationModule } from './modules/automation/automation.module';\n"+app.replace(/imports\s*:\s*\[/,'imports:[AutomationModule,');
}
let commands=fs.readFileSync(commandPath,'utf8');
// Keep one lock order: device → command, across resolve, claim and ACK.
const marker='// FLOW03_V3_DEVICE_LOCK';
if(!commands.includes(marker)){
 const claimAnchor='// PostgreSQL SKIP LOCKED prevents two workers from claiming the same rows.';
 const ackAnchor='const [c]=await q.query(`SELECT * FROM device_commands WHERE id=$1 FOR UPDATE`,[b.command_id]);';
 if(!commands.includes(claimAnchor)||!commands.includes(ackAnchor))throw new Error('commands.service.ts khác code base V2. Chưa sửa file nào. Xem hướng dẫn tích hợp thủ công.');
 commands=commands.replace(claimAnchor,marker+"\n   await q.query('SELECT id FROM devices WHERE id=$1 FOR UPDATE',[d.id]);\n   "+claimAnchor);
 commands=commands.replace(ackAnchor,"await q.query('SELECT id FROM devices WHERE id=$1 FOR UPDATE',[d.id]);\n   "+ackAnchor);
}
for(const [p,next] of [[modulePath,app],[commandPath,commands]]){
 const old=fs.readFileSync(p,'utf8');
 if(next!==old){if(!fs.existsSync(p+'.before-flow03-v3'))fs.writeFileSync(p+'.before-flow03-v3',old);fs.writeFileSync(p,next);console.log('Updated:',path.relative(root,p));}
}
console.log('Installed. Next: npm run db:migrate, then restart backend.');
