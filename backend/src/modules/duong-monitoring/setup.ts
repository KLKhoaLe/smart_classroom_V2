import source from '../../database/data-source';
import {randomUUID} from 'node:crypto';
export const demoSettings={environment_hold_seconds:20,recovery_seconds:10,security_recovery_seconds:20,
 max_gap_seconds:30,high_power_w:500,proposal_ttl_seconds:60,environment_priority:80,energy_priority:10};
export async function setupMonitoring(db:any){
 await db.transaction(async(q:any)=>{
  const [r]=await q.query("SELECT id FROM rooms WHERE code='A101'");
  if(!r)throw new Error('Chạy db:seed trước.');
  await q.query('INSERT INTO duong_monitoring_settings(room_id,config) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',[r.id,JSON.stringify(demoSettings)]);
  const [n]=await q.query('SELECT count(*)::int AS n FROM schedules WHERE room_id=$1',[r.id]);
  if(n.n===0)for(let day=0;day<7;day++)await q.query("INSERT INTO schedules(id,room_id,name,weekday,starts_at,ends_at) VALUES($1,$2,'DEMO 08:00-17:00',$3,'08:00','17:00')",[randomUUID(),r.id,day]);
 });
}
if(require.main===module)(async()=>{try{
 await source.initialize();if(await source.showMigrations())throw new Error('Chạy db:migrate trước.');
 await setupMonitoring(source);console.log('Cấu hình DEMO A101 đã tạo: duy trì môi trường 20s, hồi phục 10s, an ninh hồi phục 20s, lịch 08:00–17:00 mỗi ngày. Không ghi đè cấu hình/lịch sẵn có.');
}catch(e){console.error(e);process.exitCode=1;}finally{if(source.isInitialized)await source.destroy();}})();
