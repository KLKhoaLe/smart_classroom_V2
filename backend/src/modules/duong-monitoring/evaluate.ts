// Shared deterministic rules: embedded into n8n; rechecked by the backend before persistence.
// Proposed contract duong-monitoring-1. Does not dispatch commands or create incidents.
export function evaluate(c: any, flow: number): any {
  const t = c?.telemetry, p = c?.policy?.config, s = c?.settings;
  const source = 'WF'+String(flow).padStart(2,'0');
  const fail = (reason: string) => ({status:'REJECTED', flow, reason});
  const number = (v: any) => typeof v === 'number' && Number.isFinite(v);
  if (![7,8,9].includes(flow) || !t || !p || !s) return fail('CONTEXT_REQUIRED');
  const at = Date.parse(t.observed_at);
  if (!Number.isFinite(at) || !t.id || !t.device_id || !t.event_id || !t.run_id ||
      !Number.isSafeInteger(Number(t.sequence)) || Number(t.sequence)<0 ||
      !number(t.temperature) || t.temperature < -10 || t.temperature > 60 ||
      !number(t.humidity) || t.humidity<0 || t.humidity>100 ||
      !number(t.co2_ppm) || t.co2_ppm<300 || t.co2_ppm>5000 ||
      !number(t.power_w) || t.power_w<0 || t.power_w>20000 ||
      !Number.isInteger(t.occupancy_count) || t.occupancy_count<0 || t.occupancy_count>100 ||
      typeof t.door_open!=='boolean') return fail('INVALID_TELEMETRY');
  const ranges: any = {environment_hold_seconds:[0,3600], recovery_seconds:[0,3600],
    security_recovery_seconds:[0,3600], max_gap_seconds:[1,120], high_power_w:[0,20000],
    proposal_ttl_seconds:[5,300], environment_priority:[0,100], energy_priority:[0,100]};
  for (const k of Object.keys(ranges)) if (!number(s[k]) || s[k]<ranges[k][0] || s[k]>ranges[k][1]) return fail('INVALID_SETTING_'+k);
  if (!Number.isInteger(s.environment_priority)||!Number.isInteger(s.energy_priority))return fail('INVALID_PRIORITY');
  const old = c.state ?? null;
  if (old && (old.device_id!==t.device_id || old.flow!==flow || !Number.isFinite(Date.parse(old.observed_at)))) return fail('STATE_MISMATCH');
  if (old && (at<=Date.parse(old.observed_at) || (old.run_id===t.run_id && Number(t.sequence)<=old.sequence)))
    return {status:'IGNORED',flow,reason:'DUPLICATE_OR_OUT_OF_ORDER'};
  const dt = old ? (at-Date.parse(old.observed_at))/1000 : 0;
  const connected = !!old && old.run_id===t.run_id && dt>0 && dt<=s.max_gap_seconds;
  const sameRules = connected && old.rules_key===c.rules_key;
  const state: any = {device_id:t.device_id,flow,run_id:t.run_id,sequence:Number(t.sequence),
    observed_at:t.observed_at,rules_key:c.rules_key,conditions:{}};
  const out: any = {contract_version:'duong-monitoring-1',status:'EVALUATED',flow,
    telemetry_id:t.id,device_id:t.device_id,room_code:c.room.code,proposals:[],events:[],
    observations:{},next_state:state};
  const evidence = {event_id:t.event_id,telemetry_id:t.id,observed_at:t.observed_at,
    temperature:t.temperature,humidity:t.humidity,co2_ppm:t.co2_ppm,power_w:t.power_w,
    occupancy_count:t.occupancy_count,door_open:t.door_open,simulated:t.simulated};
  const event = (type: string, recovered: boolean, reason: string) => out.events.push({
    event_key:`${source}:${type}:${t.event_id}:${recovered?'RECOVERED':'OPEN'}`,
    dedup_key:`${source}:${t.device_id}:${type}`, source,type,
    severity:recovered?'INFO':'WARNING',recovered,reason,device_id:t.device_id,
    room_code:c.room.code,telemetry_id:t.id,observed_at:t.observed_at,evidence});
  const condition = (key: string, bad: boolean, hold: number, recovery: number, reason: string) => {
    const prev = old?.conditions?.[key];
    const x: any = {active:prev?.active===true, since:null, clear_since:null};
    if (bad) {
      x.since = sameRules && prev?.since ? prev.since : t.observed_at;
      if (!x.active && (at-Date.parse(x.since))/1000>=hold) {x.active=true;event(key,false,reason);}
    } else if (x.active) {
      x.clear_since = sameRules && prev?.clear_since ? prev.clear_since : t.observed_at;
      if ((at-Date.parse(x.clear_since))/1000>=recovery) {x.active=false;event(key,true,'Điều kiện đã hồi phục đủ thời gian cấu hình.');}
    }
    state.conditions[key]=x;return x.active;
  };
  const proposal = (desired: any, priority: number, reason: string) => out.proposals.push({
    source,device_id:t.device_id,telemetry_id:t.id,desired_state:desired,priority,reason,
    expires_at:new Date(at+s.proposal_ttl_seconds*1000).toISOString(),evidence});
  if (flow===7) {
    const desired: any = {}, metrics: any[]=[];
    for (const [metric,key,actuator,type,min,max] of [
      ['temperature','temperature_on','FAN','HIGH_TEMPERATURE',-10,60],
      ['humidity','humidity_on','DEHUMIDIFIER','HIGH_HUMIDITY',0,100],
      ['co2_ppm','co2_on','VENTILATION','HIGH_CO2',300,5000]] as any[]) {
      if(!number(p[key])||p[key]<min||p[key]>max)return fail('INVALID_POLICY_'+key);
      const active=condition(type,t[metric]>=p[key],s.environment_hold_seconds,s.recovery_seconds,
        `${metric}=${t[metric]}, ngưỡng=${p[key]}, duy trì ${s.environment_hold_seconds}s`);
      if(active)desired[actuator]='ON';
      metrics.push({metric,value:t[metric],threshold:p[key],active,since:state.conditions[type].since});
    }
    out.observations={severity:Object.keys(desired).length?'WARNING':'NORMAL_OR_WAITING',metrics};
    if(Object.keys(desired).length)proposal(desired,s.environment_priority,'Môi trường bất thường đã duy trì đủ thời gian; xem evidence và metrics.');
  }
  if(flow===8) {
    if(!number(p.empty_delay_seconds)||p.empty_delay_seconds<0||p.empty_delay_seconds>86400)return fail('INVALID_EMPTY_DELAY');
    state.empty_since=t.occupancy_count===0 ? (sameRules&&old.empty_since?old.empty_since:t.observed_at) : null;
    const elapsed=state.empty_since?(at-Date.parse(state.empty_since))/1000:0;
    const ready=t.occupancy_count===0&&elapsed>=p.empty_delay_seconds;
    const interval=connected ? (old.power_w+t.power_w)/2*dt/3600000 : 0;
    state.power_w=t.power_w;state.energy_kwh_observed=(old?.energy_kwh_observed??0)+interval;
    state.missing_seconds=(old?.missing_seconds??0)+(old&&!connected?Math.max(0,dt):0);
    condition('EMPTY_HIGH_POWER',ready&&t.power_w>=s.high_power_w,0,s.recovery_seconds,
      `Phòng vắng ${elapsed}s nhưng công suất ${t.power_w}W >= ${s.high_power_w}W`);
    out.observations={mode:t.occupancy_count>0?'OCCUPIED':ready?'EMPTY_READY':'WAITING_EMPTY',
      empty_seconds:elapsed,remaining_seconds:t.occupancy_count===0?Math.max(0,p.empty_delay_seconds-elapsed):null,
      interval_kwh:interval,interval_seconds:connected?dt:0,interval_counted:connected,
      energy_kwh_observed:state.energy_kwh_observed,missing_seconds:state.missing_seconds,
      data_gap:!!old&&!connected,energy_note:'Ước tính hình thang, chỉ cộng khoảng có hai mẫu liên tục cùng run. Không phải tổng điện cả ngày.'};
    if(ready)proposal({FAN:'OFF',LIGHT:'OFF'},s.energy_priority,`Vắng liên tục ${elapsed}s; công suất đo được ${t.power_w}W.`);
  }
  if(flow===9) {
    if(!Array.isArray(c.schedules)||!c.room.timezone)return fail('SCHEDULE_REQUIRED');
    const seconds=(v:any)=>{if(typeof v!=='string'||!/^\d{2}:\d{2}(:\d{2})?$/.test(v))return NaN;const [h,m,s=0]=v.split(':').map(Number);return h<24&&m<60&&s<60?h*3600+m*60+s:NaN;};
    if(c.schedules.some((x:any)=>!Number.isInteger(x.weekday)||x.weekday<0||x.weekday>6||
      !Number.isFinite(seconds(x.starts_at))||!Number.isFinite(seconds(x.ends_at))||seconds(x.starts_at)>=seconds(x.ends_at)))return fail('INVALID_SCHEDULE');
    let parts: any;
    try {parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:c.room.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(x=>[x.type,x.value]));}
    catch{return fail('INVALID_TIMEZONE');}
    const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
    const second=Number(parts.hour)*3600+Number(parts.minute)*60+Number(parts.second);
    const inside=c.schedules.some((x:any)=>x.weekday===day&&second>=seconds(x.starts_at)&&second<seconds(x.ends_at));
    const active=condition('AFTER_HOURS_ACTIVITY',!inside&&(t.door_open||t.occupancy_count>0),0,s.security_recovery_seconds,
      `Ngoài lịch ${c.room.timezone}; cửa=${t.door_open}, số người=${t.occupancy_count}`);
    out.observations={within_schedule:inside,security_active:active,timezone:c.room.timezone,
      local_time:`${parts.hour}:${parts.minute}:${parts.second}`,schedule_count:c.schedules.length};
  }
  return out;
}
