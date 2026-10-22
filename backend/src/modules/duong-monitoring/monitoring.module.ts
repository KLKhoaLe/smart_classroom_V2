import {Module,Injectable,Controller,Get,Post,Body,Param,ParseIntPipe,ParseUUIDPipe,BadRequestException,NotFoundException,ConflictException} from '@nestjs/common';
import {IsIn,IsInt,IsUUID,IsString,Length,IsObject} from 'class-validator';
import {DataSource} from 'typeorm';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {evaluate} from './evaluate';

const hash=(x:any)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class MonitoringCommitDto {
 @IsInt() @IsIn([7,8,9]) flow!:number;
 @IsUUID() telemetry_id!:string;
 @IsString() @Length(64,64) context_hash!:string;
 @IsObject() evaluation!:Record<string,unknown>;
}

@Injectable()
export class MonitoringService {
 // Test harness may replace clock; HTTP never accepts a caller supplied clock.
 clock=()=>Date.now();
 constructor(private readonly db:DataSource){}
 private fresh(t:any){
  const age=this.clock()-Date.parse(t.observed_at);
  if(!Number.isFinite(age)||age>30000||age< -5000)throw new ConflictException('TELEMETRY_STALE_OR_FUTURE: gửi một mẫu mới rồi chạy lại.');
 }
 private async load(q:any,flow:number,id:string){
  if(![7,8,9].includes(flow))throw new BadRequestException('Flow phải là 7, 8 hoặc 9.');
  const [t]=await q.query('SELECT * FROM telemetry WHERE id=$1',[id]);
  if(!t)throw new NotFoundException('Telemetry chưa được lưu trong backend.');
  t.observed_at=new Date(t.observed_at).toISOString();t.received_at=new Date(t.received_at).toISOString();
  t.sequence=Number(t.sequence);this.fresh(t);
  const [room]=await q.query('SELECT r.* FROM rooms r JOIN devices d ON d.room_id=r.id WHERE d.id=$1 AND d.enabled',[t.device_id]);
  if(!room)throw new NotFoundException('Không có thiết bị đang bật/phòng tương ứng.');
  const [policy]=await q.query('SELECT id,version,config FROM policies WHERE room_id=$1 AND active',[room.id]);
  const [settings]=await q.query('SELECT config FROM duong_monitoring_settings WHERE room_id=$1',[room.id]);
  if(!policy||!settings)throw new ConflictException('Thiếu policy hoặc cấu hình giám sát. Chạy setup demo được hướng dẫn.');
  const schedules=await q.query('SELECT weekday,starts_at::text,ends_at::text FROM schedules WHERE room_id=$1 ORDER BY weekday,starts_at,ends_at',[room.id]);
  const [previous]=await q.query('SELECT version,state FROM duong_monitoring_states WHERE device_id=$1 AND flow=$2',[t.device_id,flow]);
  const c:any={telemetry:t,room:{id:room.id,code:room.code,timezone:room.timezone},policy,settings:settings.config,schedules,
   version:previous?.version??0,state:previous?.state??null};
  c.rules_key=hash({policy,settings:settings.config,schedules,timezone:room.timezone});
  c.context_hash=hash(c);return c;
 }
 context(flow:number,id:string){return this.load(this.db,flow,id);}
 async commit(b:MonitoringCommitDto){return this.db.transaction(async(q:any)=>{
  const [t]=await q.query('SELECT device_id FROM telemetry WHERE id=$1',[b.telemetry_id]);
  if(!t)throw new NotFoundException('Telemetry không tồn tại.');
  // Serialize state, energy and event updates for this device across all three flows.
  await q.query('SELECT id FROM devices WHERE id=$1 FOR UPDATE',[t.device_id]);
  const [saved]=await q.query('SELECT result FROM duong_monitoring_results WHERE flow=$1 AND telemetry_id=$2',[b.flow,b.telemetry_id]);
  if(saved)return {created:false,...saved.result,new_events:[],delivery_status:'ALREADY_RECORDED'};
  const c=await this.load(q,b.flow,b.telemetry_id);
  if(c.context_hash!==b.context_hash)throw new ConflictException('CONTEXT_CHANGED: đọc lại context và tính lại; không ghi đè state mới.');
  const result=evaluate(c,b.flow);
  if(result.status==='REJECTED')throw new BadRequestException(result.reason);
  if(result.status==='IGNORED')return {created:false,...result,new_events:[]};
  if(!isDeepStrictEqual(result,b.evaluation))throw new BadRequestException('EVALUATION_MISMATCH: JSON workflow và backend phải cùng phiên bản.');
  await q.query('INSERT INTO duong_monitoring_states(device_id,flow,proposal_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[t.device_id,b.flow,randomUUID()]);
  const [row]=await q.query('SELECT proposal_id FROM duong_monitoring_states WHERE device_id=$1 AND flow=$2',[t.device_id,b.flow]);
  const proposal=result.proposals[0];
  if(proposal){
   if(Date.parse(proposal.expires_at)<=this.clock())throw new ConflictException('PROPOSAL_EXPIRED: gửi telemetry mới.');
   await q.query(`INSERT INTO control_proposals(id,device_id,telemetry_id,source,desired_state,priority,reason,expires_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET
    telemetry_id=EXCLUDED.telemetry_id,desired_state=EXCLUDED.desired_state,priority=EXCLUDED.priority,
    reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at`,
    [row.proposal_id,t.device_id,b.telemetry_id,proposal.source,JSON.stringify(proposal.desired_state),proposal.priority,proposal.reason,proposal.expires_at]);
  }else{
   await q.query('UPDATE control_proposals SET expires_at=LEAST(expires_at,$2::timestamptz) WHERE id=$1',[row.proposal_id,c.telemetry.observed_at]);
  }
  const events=[];
  for(const e of result.events){
   const id=randomUUID();
   await q.query('INSERT INTO duong_monitoring_events(id,event_key,device_id,flow,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[id,e.event_key,t.device_id,b.flow,JSON.stringify(e)]);
   events.push({id,...e});
  }
  await q.query('UPDATE duong_monitoring_states SET version=version+1,state=$3::jsonb WHERE device_id=$1 AND flow=$2',[t.device_id,b.flow,JSON.stringify(result.next_state)]);
  const recorded={...result,new_events:events,delivery_status:'PENDING_INTEGRATION',
    integration:{state_saved:true,proposal_saved:!!proposal,flow03_connected:false,wf10_connected:false}};
  await q.query('INSERT INTO duong_monitoring_results(flow,telemetry_id,device_id,result) VALUES($1,$2,$3,$4::jsonb)',[b.flow,b.telemetry_id,t.device_id,JSON.stringify(recorded)]);
  return {created:true,...recorded};
 });}
 async status(device:string){
  const [d]=await this.db.query('SELECT id,code FROM devices WHERE code=$1 OR id::text=$1',[device]);
  if(!d)throw new NotFoundException('Không có thiết bị.');
  return {device:d,states:await this.db.query('SELECT flow,version,state FROM duong_monitoring_states WHERE device_id=$1 ORDER BY flow',[d.id]),
    proposals:await this.db.query('SELECT * FROM control_proposals WHERE device_id=$1 AND expires_at>now() ORDER BY priority DESC',[d.id]),
    events:await this.db.query('SELECT * FROM duong_monitoring_events WHERE device_id=$1 ORDER BY created_at DESC LIMIT 100',[d.id]),
    integration:{flow03_connected:false,wf10_connected:false}};
 }
}
@Controller('duong-monitoring')
class MonitoringController {
 constructor(private readonly service:MonitoringService){}
 @Get('context/:flow/:telemetry') context(@Param('flow',ParseIntPipe) flow:number,@Param('telemetry',ParseUUIDPipe) id:string){return this.service.context(flow,id);}
 @Post('commit') commit(@Body() b:MonitoringCommitDto){return this.service.commit(b);}
 @Get('status/:device') status(@Param('device') device:string){return this.service.status(device);}
}
@Module({controllers:[MonitoringController],providers:[MonitoringService]})
export class DuongMonitoringModule {}
