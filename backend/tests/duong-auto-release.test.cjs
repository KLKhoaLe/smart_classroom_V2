const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {InitialSchema1792200000000}=require('../dist/database/migrations/1792200000000-InitialSchema');
const {seed}=require('../dist/database/seed');
const {DeviceService}=require('../dist/modules/device.service');
const {CommandsService}=require('../dist/modules/commands.service');
function wrap(pg){return {query:async(sql,args)=>{if(args===undefined)return (await pg.exec(sql)).at(-1)?.rows||[];const r=await pg.query(sql,args);return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows??0]:r.rows;},transaction:fn=>pg.transaction(tx=>fn(wrap(tx)))}}
test('Return AUTO cancels unsent manual, retains actual/SENT and rejects stale release',async()=>{
 const pg=new PGlite(),db=wrap(pg);try{
 await new InitialSchema1792200000000().up(db);await seed(db);
 const devices=new DeviceService(db),commands=new CommandsService(db,devices),device='ESP32_A101';
 const hold=await devices.setOverride({device_id:device,command_type:'FAN',action:'ON',override_minutes:5});
 const c=(await commands.create({device_id:device,command_type:'FAN',action:'ON',source:'MANUAL',idempotency_key:'release'})).command;
 await commands.dispatch(c.id);
 const result=await devices.clearOverride(device,'FAN',{expected_id:hold.id,expected_expires_at:new Date(hold.expires_at).toISOString()});
 assert.equal(result.mode,'AUTO');assert.equal(result.cancelled_commands,1);
 assert.equal((await commands.claim(device)).commands.length,0);
 assert.equal((await commands.get(c.id)).status,'CANCELLED');
 assert.equal((await devices.states(device)).find(s=>s.command_type==='FAN').actual_state,null);
 assert.equal((await devices.clearOverride(device,'FAN')).deleted,false);
 const newer=await devices.setOverride({device_id:device,command_type:'FAN',action:'OFF',override_minutes:10});
 await assert.rejects(()=>devices.clearOverride(device,'FAN',{expected_id:hold.id}),/đã thay đổi/);
 const sent=(await commands.create({device_id:device,command_type:'FAN',action:'OFF',source:'MANUAL',idempotency_key:'sent'})).command;
 await commands.dispatch(sent.id);await commands.claim(device);
 assert.equal((await devices.clearOverride(device,'FAN',{expected_id:newer.id})).awaiting_ack,true);
 assert.equal((await commands.get(sent.id)).status,'SENT');
 await commands.ack({device_id:device,command_id:sent.id,status:'SUCCESS',actual_state:{FAN:'OFF'}});
 assert.equal((await devices.states(device)).find(s=>s.command_type==='FAN').actual_state,'OFF');
 await assert.rejects(()=>devices.clearOverride(device,'UNKNOWN'),/không hợp lệ/);
 }finally{await pg.close()}
});
