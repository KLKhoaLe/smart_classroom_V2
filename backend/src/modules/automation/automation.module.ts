import { Module, Controller, Post, Get, Body, Param, ParseUUIDPipe, Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { IsIn, IsOptional, IsString, IsUUID, IsInt, Min, Max, MaxLength, IsNotEmpty } from 'class-validator';
import { randomUUID, createHash } from 'node:crypto';

const TYPES = ['FAN','LIGHT','VENTILATION','DEHUMIDIFIER'];
const ACTIVE = ['PENDING','QUEUED','SENT'];
export class ResolveAutomationDto {
 @IsString() @IsNotEmpty() @MaxLength(100) device_id!:string;
 @IsIn(['AUTO','MANUAL']) source!:string;
 @IsOptional() @IsUUID() decision_id?:string;
 @IsOptional() @IsUUID() request_id?:string;
 @IsOptional() @IsIn(TYPES) command_type?:string;
 @IsOptional() @IsIn(['ON','OFF']) action?:string;
 @IsOptional() @IsInt() @Min(1) @Max(120) override_minutes?:number;
}

@Injectable()
export class AutomationService {
 constructor(private readonly db:DataSource){}
 private async device(q:EntityManager, ref:string) {
  const [d]=await q.query(`SELECT * FROM devices WHERE (id::text=$1 OR code=$1) AND enabled FOR UPDATE`,[ref]);
  if(!d)throw new NotFoundException('Không tìm thấy thiết bị đang bật.');
  return d;
 }
 private async policy(q:EntityManager,d:any) {
  const [p]=await q.query(`SELECT * FROM policies WHERE room_id=$1 AND active`,[d.room_id]);
  if(!p || !Number.isInteger(p.config.command_ttl_seconds) || p.config.command_ttl_seconds<5 || p.config.command_ttl_seconds>300)
   throw new BadRequestException('Policy thiếu command_ttl_seconds hợp lệ (5..300).');
  return p;
 }
 private async decision(q:EntityManager,d:any,id:string,p:any,now:number) {
  const [a]=await q.query(`SELECT * FROM automation_decisions WHERE id=$1 AND device_id=$2`,[id,d.id]);
  if(!a)throw new BadRequestException('Decision không thuộc thiết bị.');
  const until=Date.parse(a.evidence?.valid_until);
  if(!Number.isFinite(until)||until<=now)return {reason:'DECISION_EXPIRED',a};
  if(a.evidence?.workflow_version!=='V3'||a.evidence?.policy_id!==p.id||a.evidence?.policy_version!==p.version)return {reason:'POLICY_CHANGED',a};
  const [latest]=await q.query(`SELECT * FROM telemetry WHERE device_id=$1 ORDER BY observed_at DESC,sequence DESC LIMIT 1`,[d.id]);
  if(!latest||latest.id!==a.telemetry_id)return {reason:'TELEMETRY_SUPERSEDED',a};
  const age=now-new Date(latest.observed_at).getTime();
  if(age>120000||age< -60000)return {reason:'TELEMETRY_STALE',a};
  if(!TYPES.every(t=>['ON','OFF'].includes(a.actions?.[t]) && a.evidence?.allowed_actions?.[t]?.includes(a.actions[t])))
   return {reason:'INVALID_SAVED_ACTIONS',a};
  return {reason:null,a};
 }
 async resolve(b:ResolveAutomationDto) {
  if(b.source==='AUTO'&&!b.decision_id)throw new BadRequestException('AUTO cần decision_id.');
  if(b.source==='MANUAL'&&(!b.request_id||!b.command_type||!b.action||!b.override_minutes))
   throw new BadRequestException('MANUAL cần request_id, command_type, action, override_minutes.');
  return this.db.transaction(async q=>{
   const d=await this.device(q,b.device_id);
   const [{now:clock}]=await q.query('SELECT clock_timestamp() AS now'); const now=new Date(clock).getTime();
   const key=b.source==='AUTO'?`V3:AUTO:${b.decision_id}`:`V3:MANUAL:${b.request_id}`;
   const fingerprint=createHash('sha256').update(JSON.stringify([d.id,b.source,b.source==='AUTO'?b.decision_id:[b.command_type,b.action,b.override_minutes]])).digest('hex');
   const [previous]=await q.query('SELECT * FROM automation_runs WHERE request_key=$1',[key]);
   if(previous){
    if(previous.fingerprint!==fingerprint)throw new ConflictException('Request ID đã dùng cho nội dung khác.');
    const commands=await q.query(`SELECT *,id AS command_id FROM device_commands WHERE id=ANY($1::uuid[]) ORDER BY sequence`,[previous.result.command_ids||[]]);
    return {...previous.result,duplicate:true,commands,commands_to_dispatch:commands.filter((c:any)=>c.status==='PENDING'&&new Date(c.expires_at).getTime()>now)};
   }
   const p=await this.policy(q,d);
   const skipped:any[]=[]; const commands:any[]=[];
   const finish=async(reason?:string)=>{
    const result={workflow_version:'V3',device_id:d.id,device_code:d.code,source:b.source,request_key:key,
     automation_status:commands.length?'COMMANDS_CREATED':'NO_COMMAND',reason:reason||null,
     decision_id:b.decision_id||null,command_ids:commands.map(c=>c.id),skipped,duplicate:false};
    await q.query(`INSERT INTO automation_runs(request_key,device_id,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)`,[key,d.id,fingerprint,JSON.stringify(result)]);
    await q.query(`INSERT INTO device_events(id,device_id,event_type,payload) VALUES($1,$2,'AUTOMATION_RESOLVED',$3::jsonb)`,[randomUUID(),d.id,JSON.stringify(result)]);
    return {...result,commands,commands_to_dispatch:commands};
   };
   if(!d.last_seen||now-new Date(d.last_seen).getTime()>90000)return finish('DEVICE_OFFLINE');
   let actions:Record<string,string>={}; let deadline=now+p.config.command_ttl_seconds*1000;
   if(b.source==='AUTO'){
    const checked=await this.decision(q,d,b.decision_id!,p,now);
    if(checked.reason)return finish(checked.reason);
    actions=checked.a.actions;deadline=Math.min(deadline,Date.parse(checked.a.evidence.valid_until));
   }else actions={[b.command_type!]:b.action!};
   if(deadline-now<5000)return finish('TOO_LITTLE_TTL');
   await q.query(`UPDATE device_commands SET status='TIMED_OUT' WHERE device_id=$1 AND status IN ('PENDING','QUEUED','SENT') AND expires_at<=clock_timestamp()`,[d.id]);
   const cooldownRaw=Number(process.env.AUTOMATION_COOLDOWN_SECONDS??15);
   const cooldown=Number.isFinite(cooldownRaw)?Math.max(0,Math.min(300,cooldownRaw)):15;
   for(const [type,action] of Object.entries(actions)){
    if(!TYPES.includes(type))throw new BadRequestException('Loại thiết bị không hợp lệ.');
    const pending=await q.query(`SELECT * FROM device_commands WHERE device_id=$1 AND command_type=$2 AND status IN ('PENDING','QUEUED','SENT') ORDER BY sequence DESC FOR UPDATE`,[d.id,type]);
    if(b.source==='AUTO'){
     const [override]=await q.query(`SELECT * FROM manual_overrides WHERE device_id=$1 AND command_type=$2 AND expires_at>clock_timestamp()`,[d.id,type]);
     if(override){skipped.push({command_type:type,reason:'MANUAL_OVERRIDE',until:override.expires_at});continue;}
    }
    // Never stack a new command behind an unacknowledged command for the same actuator.
    if(pending.some((c:any)=>c.status==='SENT')){skipped.push({command_type:type,reason:'AWAITING_ACK'});continue;}
    if(b.source==='AUTO'&&pending.length){skipped.push({command_type:type,reason:'COMMAND_IN_FLIGHT'});continue;}
    if(b.source==='MANUAL'){
     await q.query(`UPDATE device_commands SET status='CANCELLED' WHERE device_id=$1 AND command_type=$2 AND status IN ('PENDING','QUEUED')`,[d.id,type]);
     await q.query(`INSERT INTO manual_overrides(id,device_id,command_type,action,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(device_id,command_type) DO UPDATE SET action=EXCLUDED.action,expires_at=EXCLUDED.expires_at,created_at=clock_timestamp()`,[randomUUID(),d.id,type,action,new Date(now+b.override_minutes!*60000)]);
    }
    const [state]=await q.query(`SELECT * FROM device_states WHERE device_id=$1 AND command_type=$2`,[d.id,type]);
    if(state?.actual_state===action){skipped.push({command_type:type,reason:'ALREADY_CONFIRMED',override_registered:b.source==='MANUAL'});continue;}
    const [last]=await q.query(`SELECT requested_at FROM device_commands WHERE device_id=$1 AND command_type=$2 ORDER BY sequence DESC LIMIT 1`,[d.id,type]);
    if(b.source==='AUTO'&&last&&now-new Date(last.requested_at).getTime()<cooldown*1000){skipped.push({command_type:type,reason:'COOLDOWN'});continue;}
    const [c]=await q.query(`INSERT INTO device_commands(id,device_id,decision_id,idempotency_key,command_type,action,source,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *,id AS command_id`,[randomUUID(),d.id,b.source==='AUTO'?b.decision_id:null,`${key}:${type}`,type,action,b.source,new Date(deadline)]);
    await q.query(`INSERT INTO device_states(device_id,command_type,desired_state,desired_sequence) VALUES($1,$2,$3,$4) ON CONFLICT(device_id,command_type) DO UPDATE SET desired_state=EXCLUDED.desired_state,desired_sequence=EXCLUDED.desired_sequence`,[d.id,type,action,c.sequence]);
    commands.push(c);
   }
   return finish();
  });
 }
 async dispatch(id:string) {
  return this.db.transaction(async q=>{
   const [ref]=await q.query('SELECT device_id FROM device_commands WHERE id=$1',[id]);
   if(!ref)throw new NotFoundException('Không có command.');
   const d=await this.device(q,ref.device_id);
   const [c]=await q.query('SELECT *,id AS command_id FROM device_commands WHERE id=$1 FOR UPDATE',[id]);
   if(c.status!=='PENDING')return {dispatched:false,reason:'ALREADY_PROCESSED',command:c};
   const [{now:clock}]=await q.query('SELECT clock_timestamp() AS now');const now=new Date(clock).getTime();
   let reason:string|null=null;
   if(new Date(c.expires_at).getTime()<=now)reason='COMMAND_EXPIRED';
   else if(!d.last_seen||now-new Date(d.last_seen).getTime()>90000)reason='DEVICE_OFFLINE';
   else if(c.source==='AUTO'){
    const p=await this.policy(q,d);
    const checked=await this.decision(q,d,c.decision_id,p,now);reason=checked.reason;
    if(!reason&&checked.a.actions?.[c.command_type]!==c.action)reason='ACTION_MISMATCH';
    const [override]=await q.query('SELECT id FROM manual_overrides WHERE device_id=$1 AND command_type=$2 AND expires_at>clock_timestamp()',[d.id,c.command_type]);
    if(override)reason='MANUAL_OVERRIDE';
   }else if(c.source==='MANUAL'){
    const [override]=await q.query('SELECT action FROM manual_overrides WHERE device_id=$1 AND command_type=$2 AND expires_at>clock_timestamp()',[d.id,c.command_type]);
    if(!override||override.action!==c.action)reason='MANUAL_OVERRIDE_CHANGED';
   }else reason='UNSUPPORTED_SOURCE';
   const status=reason?(reason==='COMMAND_EXPIRED'?'TIMED_OUT':'CANCELLED'):'QUEUED';
   await q.query('UPDATE device_commands SET status=$2 WHERE id=$1',[id,status]);
   if(reason)await q.query(`INSERT INTO device_events(id,device_id,command_id,event_type,payload) VALUES($1,$2,$3,'DISPATCH_BLOCKED',$4::jsonb) ON CONFLICT(command_id,event_type) DO NOTHING`,[randomUUID(),d.id,id,JSON.stringify({reason})]);
   return {dispatched:!reason,reason,command:{...c,status}};
  });
 }
 async overrides(ref:string){return this.db.query(`SELECT m.* FROM manual_overrides m JOIN devices d ON d.id=m.device_id WHERE (d.id::text=$1 OR d.code=$1) AND m.expires_at>clock_timestamp() ORDER BY command_type`,[ref]);}
}

@Controller('automation')
export class AutomationController {
 constructor(private readonly service:AutomationService){}
 @Post('resolve') resolve(@Body() b:ResolveAutomationDto){return this.service.resolve(b);}
 @Post('commands/:id/dispatch') dispatch(@Param('id',ParseUUIDPipe) id:string){return this.service.dispatch(id);}
 @Get('overrides/:device') overrides(@Param('device') device:string){return this.service.overrides(device);}
}
@Module({controllers:[AutomationController],providers:[AutomationService]})
export class AutomationModule {}
