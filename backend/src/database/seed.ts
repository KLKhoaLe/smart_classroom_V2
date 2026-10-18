import source from './data-source';
export async function seed(db: {transaction:Function}) {
 await db.transaction(async(q:any)=>{
  await q.query(`INSERT INTO rooms(id,code,name) VALUES($1,'A101','Phòng học A101') ON CONFLICT(code) DO NOTHING`,['10000000-0000-4000-8000-000000000001']);
  await q.query(`INSERT INTO devices(id,room_id,code,name) SELECT $1,id,'ESP32_A101','Gateway mô phỏng A101' FROM rooms WHERE code='A101' ON CONFLICT(code) DO NOTHING`,['20000000-0000-4000-8000-000000000001']);
  await q.query(`INSERT INTO device_states(device_id,command_type) SELECT d.id,t FROM devices d CROSS JOIN unnest(ARRAY['FAN','LIGHT','VENTILATION','DEHUMIDIFIER']) t WHERE d.code='ESP32_A101' ON CONFLICT DO NOTHING`);
  await q.query(`INSERT INTO policies(id,room_id,version,active,config) SELECT $1,r.id,1,true,$2::jsonb FROM rooms r WHERE r.code='A101' AND NOT EXISTS (SELECT 1 FROM policies p WHERE p.room_id=r.id) ON CONFLICT DO NOTHING`,['30000000-0000-4000-8000-000000000001',JSON.stringify({temperature_on:30,temperature_off:28,humidity_on:75,co2_on:1200,light_on_below:30,empty_delay_seconds:30,command_ttl_seconds:60,ai_interval_seconds:60})]);
 });
}
if(require.main===module)(async()=>{try{await source.initialize();if(await source.showMigrations())throw new Error('Chạy migration:run trước.');await seed(source);console.log('Seed hoàn tất (chạy lại không nhân đôi / không ghi đè cấu hình).');}catch(e){console.error(e);process.exitCode=1;}finally{if(source.isInitialized)await source.destroy();}})();
