import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionPreset, connectionSummary, commandEvidence } from '../public/demo-ui.js';
const config = () => ({...connectionPreset('backend'),faults:{offline:false,drop_ack:false,fail_command:false}});
const command = (id,status='SUCCESS') => ({type:status==='SUCCESS'?'command':'error',time:'2026-10-21T03:00:00Z',message:'result',data:{command_id:id,command_type:'FAN',status}});
test('backend preset uses V2 endpoints without changing identity or sensors',()=>{
 const p=connectionPreset('backend');assert.equal(p.telemetry_url,'http://127.0.0.1:3001/api/telemetry');assert.equal(p.ack_url,'http://127.0.0.1:3001/api/commands/ack');assert.equal(p.claim_url,'http://127.0.0.1:3001/api/commands/claim');assert.equal(p.heartbeat_url,'http://127.0.0.1:3001/api/devices/heartbeat');assert.equal(p.mode,'http');assert.equal(p.device_id,undefined);assert.equal(p.sensors,undefined);
});
test('flow01 preset changes only telemetry routing',()=>{assert.deepEqual({...connectionPreset('flow01'),telemetry_url:connectionPreset('backend').telemetry_url},connectionPreset('backend'));assert.match(connectionPreset('flow01').telemetry_url,/\/webhook\/simulator-telemetry$/);});
test('readiness reveals preview, stopped run, missing URL and active faults',()=>{const c=config();c.mode='preview';c.ack_url='';c.faults.drop_ack=true;const notes=connectionSummary(c,'stopped').join(' ');assert.match(notes,/xem trước/);assert.match(notes,/Chưa cấu hình ACK/);assert.match(notes,/Không trả ACK/);assert.match(notes,/Phiên đã dừng/);});
test('paused explains that heartbeat and commands keep running',()=>{assert.match(connectionSummary(config(),'paused').join(' '),/heartbeat và nhận lệnh vẫn tiếp tục/);assert.deepEqual(connectionSummary(config(),'running'),[]);});
test('ACK evidence never leaks from a different command',()=>{const logs=[{type:'success',message:'ACK: HTTP 200',data:{command_id:'old'}},command('new')];assert.match(commandEvidence(logs,'http').ack,/Chưa có bằng chứng/);});
test('ACK HTTP success is distinguished from backend business confirmation',()=>{const logs=[{type:'success',message:'ACK: HTTP 200',data:{command_id:'a'}},command('a')];assert.match(commandEvidence(logs,'http').ack,/đối chiếu trạng thái backend/);});
test('drop ACK, failed execution and preview are explicitly reported',()=>{assert.match(commandEvidence([{type:'warning',message:'Cố ý bỏ ACK để kiểm thử timeout.',data:{command_id:'a'}},command('a')],'http').ack,/bị bỏ/);assert.equal(commandEvidence([command('a','FAILED')],'http').executed,false);assert.match(commandEvidence([command('a')],'preview').ack,/Xem trước/);assert.equal(commandEvidence([],'http'),null);});
