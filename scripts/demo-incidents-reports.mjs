const base=process.env.API_BASE||'http://localhost:3001/api';
const room=process.env.DEMO_ROOM||'A101';
const token=process.env.API_TOKEN;
async function api(path,method='GET',body){const r=await fetch(`${base}/${path}`,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);return data;}
const scenarios=[['normal','No incident candidate expected'],['hot','HIGH_TEMPERATURE / WARNING'],['humid','HIGH_HUMIDITY / WARNING'],['co2','HIGH_CO2 / CRITICAL'],['empty','ENERGY_WASTE / WARNING'],['after-hours','AFTER_HOURS_DOOR / WARNING']];
console.log('Ensure simulator HTTP mode routes telemetry to WF01 and heartbeat to WF06.');
for(const [scenario,expected] of scenarios)console.log(`Select ${scenario}; expected: ${expected}`);
console.log('Send invalid payload (temperature=999): WF01 should post ingestion-errors and stop processing.');
console.log('Resend event_id: WF01 should detect created=false and stop duplicate processing.');
console.log('Enable drop ACK, dispatch a command, wait past TTL: WF05/WF06 should yield TIMED_OUT.');
console.log('Enable offline and run WF06: heartbeat stops; expect DEVICE_OFFLINE candidate.');
const [incidents,reports]=await Promise.all([api('incidents?room='+encodeURIComponent(room)),api('reports?room='+encodeURIComponent(room))]);
console.log(`Current ${room}: ${incidents.length} incidents, ${reports.length} reports.`);
console.log(`Daily: POST /reports/daily/${encodeURIComponent(room)}`);
console.log(`WF12 context: GET /reports/weekly/context/${encodeURIComponent(room)}; draft only when eligible=true, then POST /reports/weekly/${encodeURIComponent(room)} with AI summary and recommendations.`);
