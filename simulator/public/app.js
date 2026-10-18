const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const specs=[['temperature','Nhiệt độ','°C',-10,60,.1,'◉'],['humidity','Độ ẩm','%',0,100,1,'◈'],['light_percent','Độ sáng','%',0,100,1,'☀'],['occupancy_count','Số người','người',0,100,1,'♙'],['co2_ppm','CO₂','ppm',300,5000,10,'≈'],['power_w','Công suất','W',0,20000,10,'ϟ'],['pm25_ug_m3','Bụi PM2.5','µg/m³',0,500,1,'⋯'],['water_l_min','Lưu lượng nước','L/min',0,100,.1,'◇']];
const deviceMeta={FAN:['Quạt','✣'],LIGHT:['Đèn chiếu sáng','☀'],VENTILATION:['Thông gió','≋'],DEHUMIDIFIER:['Máy hút ẩm','◈']};
let state, sensorDirty=false, configDirty=false, toastTimer, lastLogKey='', tab='overview';
function toast(message,error=false){$('#toast').textContent=message;$('#toast').className='show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').className='',4200);}
async function api(path,data){const r=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:{'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});const b=await r.json();if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
async function act(fn,message){try{await fn();if(message)toast(message);await refresh();}catch(e){toast(e.message,true);}}
$('#sensor-grid').innerHTML=specs.map(([key,label,unit,min,max,step,icon])=>`<div class="sensor"><div class="sensor-top"><span class="sensor-name"><span class="sensor-icon">${icon}</span>${label}</span><label class="sensor-value"><input aria-label="${label}" id="value-${key}" type="number" min="${min}" max="${max}" step="${step}"><small>${unit}</small></label></div><input aria-label="Thanh ${label}" type="range" id="range-${key}" min="${min}" max="${max}" step="${step}"><div class="sensor-limits"><span>${min}</span><span>${max} ${unit}</span></div></div>`).join('');
function markDirty(){sensorDirty=true;$('#sensor-dirty').textContent='Có thay đổi chưa áp dụng. Bấm “Áp dụng giá trị” trước khi gửi.';}
for(const [key] of specs){for(const prefix of ['range','value'])$(`#${prefix}-${key}`).addEventListener('input',e=>{$(`#${prefix==='range'?'value':'range'}-${key}`).value=e.target.value;markDirty();});}
$('#door-open').onchange=markDirty;$('#jitter').onchange=markDirty;
async function saveSensors(){const sensors={door_open:$('#door-open').checked};for(const [key] of specs){const el=$(`#value-${key}`);if(el.value===''||!el.checkValidity())throw new Error('Kiểm tra lại giá trị cảm biến.');sensors[key]=Number(el.value);}await api('config',{sensors,jitter:$('#jitter').checked});sensorDirty=false;}
$('#apply-sensors').onclick=()=>act(saveSensors,'Đã áp dụng bộ cảm biến.');
$('#send-once').onclick=()=>act(async()=>{if(sensorDirty)await saveSensors();const r=await api('send',{});if(r.skipped)throw new Error('Đang gửi bản tin trước, vui lòng chờ.');toast(r.mode==='preview'?'Đã tạo mẫu xem trước.':r.delivered?'Đích đã nhận HTTP. Xem execution n8n để xác nhận xử lý.':'Chưa gửi được. Mở Nhật ký sự kiện.',!r.delivered);});
for(const a of ['start','pause','stop'])$('#'+a).onclick=()=>act(async()=>{if(a==='start'&&sensorDirty)await saveSensors();await api('run',{action:a});});
$('#duplicate').onclick=()=>act(async()=>{const r=await api('send',{duplicate:true});if(r.skipped)throw new Error('Đang gửi bản tin trước.');toast(r.delivered?'Đã gửi lại bản tin với cùng event_id.':'Chưa gửi được. Kiểm tra nhật ký.',!r.delivered);});
$$('[data-fault]').forEach(el=>el.onchange=()=>act(()=>api('config',{faults:{[el.dataset.fault]:el.checked}})));
$$('[data-tab]').forEach(el=>el.onclick=()=>{tab=el.dataset.tab;$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+tab));$$('.nav').forEach(n=>n.classList.toggle('active',n===el));if(tab==='logs')renderLogs();});
$('#connection-form').addEventListener('input',()=>configDirty=true);
$('#connection-form').onsubmit=e=>{e.preventDefault();act(async()=>{const patch=Object.fromEntries(new FormData(e.target));for(const k of ['interval_ms','heartbeat_ms','poll_ms'])patch[k]=Math.round(Number(patch[k])*1000);await api('config',patch);configDirty=false;},'Đã lưu cấu hình kết nối.');};
$('#demo-settings').onclick=()=>{const f=$('#connection-form');f.elements.mode.value='http';for(const k of ['telemetry','heartbeat','ack'])f.elements[k+'_url'].value=`http://localhost:4311/${k}`;f.elements.claim_url.value='';configDirty=true;toast('Đã điền. Chạy npm run demo:receiver rồi bấm Lưu cấu hình.');};
$('#copy-payload').onclick=()=>act(async()=>{if(!state.last_payload)throw new Error('Chưa có payload.');await navigator.clipboard.writeText(JSON.stringify(state.last_payload,null,2));},'Đã sao chép payload.');
$('#clear-logs').onclick=()=>act(()=>api('logs/clear',{}));
$('#log-search').oninput=()=>renderLogs(true);$('#log-filter').onchange=()=>renderLogs(true);
function renderLogs(force=false){if(!state)return;const key=state.logs.map(x=>x.id).join('')+$('#log-search').value+$('#log-filter').value;if(!force&&key===lastLogKey)return;lastLogKey=key;
 const opened=new Set($$('#logs details[open]').map(x=>x.dataset.id));
 const term=$('#log-search').value.toLowerCase(),filter=$('#log-filter').value;
 const logs=state.logs.filter(x=>(filter==='all'||x.type===filter)&&JSON.stringify(x).toLowerCase().includes(term));
 $('#logs').innerHTML=logs.length?logs.map(x=>`<details class="log-row" data-id="${esc(x.id)}" ${opened.has(x.id)?'open':''}><summary class="log-summary"><time>${new Date(x.time).toLocaleTimeString('vi-VN')}</time><span class="log-tag ${esc(x.type)}">${esc(x.type)}</span><span>${esc(x.message)}</span></summary><pre>${esc(JSON.stringify(x.data||{message:x.message,time:x.time},null,2))}</pre></details>`).join(''):'<div class="empty">Chưa có sự kiện phù hợp. Hãy gửi một mẫu để bắt đầu.</div>';
}
function render(s){state=s;$('#server-status').textContent='● Node.js đang hoạt động';$('#server-status').style.background='';
 $('#room-label').textContent=s.config.room_code;$('#run-label').textContent={running:'Đang phát dữ liệu',paused:'Tạm dừng telemetry',stopped:'Đã dừng'}[s.status];$('#run-dot').className='dot '+s.status;
 $('#run-detail').textContent=`${s.config.device_code} · Chu kỳ ${s.config.interval_ms/1000}s · Mẫu #${s.sequence}`;
 $('#start').disabled=s.status==='running';$('#pause').disabled=s.status!=='running';$('#stop').disabled=s.status==='stopped';$('#duplicate').disabled=!s.last_payload;
 const http=s.config.mode==='http';$('#mode-note').className='notice'+(http?' http':'');$('#mode-note').textContent=http?'HTTP đang bật • Kiểm tra nhật ký để biết đích đã nhận dữ liệu hay chưa. Thành công HTTP chưa đồng nghĩa workflow xử lý thành công.':'Chế độ xem trước • Chưa gửi đến n8n. Bạn có thể thử cảm biến và thiết bị, sau đó cấu hình tại “Kết nối n8n”.';
 for(const key of ['generated','sent','commands','errors'])$('#stat-'+key).textContent=s.counters[key];
 if(!sensorDirty){for(const [key] of specs){$('#value-'+key).value=s.config.sensors[key];$('#range-'+key).value=s.config.sensors[key];}$('#door-open').checked=s.config.sensors.door_open;$('#jitter').checked=s.config.jitter;$('#sensor-dirty').textContent='Các giá trị đã được đồng bộ.';}
 if(!configDirty){const f=$('#connection-form');for(const el of f.elements){if(el.name&&el.name in s.config)el.value=el.name.endsWith('_ms')?s.config[el.name]/1000:s.config[el.name];}}
 $$('[data-fault]').forEach(el=>el.checked=s.config.faults[el.dataset.fault]);
 if(!$('#scenario-grid').children.length){$('#scenario-grid').innerHTML=s.scenarios.map(x=>`<button class="scenario" data-scenario="${esc(x.id)}"><strong>${esc(x.name)}</strong><span>${esc(x.description)}</span></button>`).join('');$$('[data-scenario]').forEach(el=>el.onclick=()=>act(async()=>{await api('scenario',{id:el.dataset.scenario});sensorDirty=false;},'Đã áp dụng kịch bản.'));}
 $$('[data-scenario]').forEach(el=>el.classList.toggle('selected',el.dataset.scenario===s.scenario));
 const deviceKey=JSON.stringify(s.devices)+s.config.mode;
 if($('#devices').dataset.key!==deviceKey){$('#devices').dataset.key=deviceKey;$('#devices').innerHTML=Object.entries(deviceMeta).map(([k,[label,icon]])=>`<div class="device ${s.devices[k]==='ON'?'on':''}"><span class="device-icon">${icon}</span><div><div class="device-name">${label}</div><div class="device-type">${k}</div></div><span class="state">${s.devices[k]}</span>${!http?`<button data-device="${k}" aria-label="Thử bật tắt ${label}">Thử ${s.devices[k]==='ON'?'tắt':'bật'}</button>`:''}</div>`).join('');$$('[data-device]').forEach(el=>el.onclick=()=>act(()=>api('local-command',{command_type:el.dataset.device,action:state.devices[el.dataset.device]==='ON'?'OFF':'ON'}),'Đã thử lệnh nội bộ.'));}
 $('#payload').textContent=s.last_payload?JSON.stringify(s.last_payload,null,2):'Chưa tạo bản tin.';$('#log-count').textContent=s.logs.length;
 const points=s.history.map((p,i)=>`${25+i*630/Math.max(s.history.length-1,1)},${115-(p.temperature+10)/70*100}`).join(' ');
 $('#chart').innerHTML=`<path d="M25 15H655M25 65H655M25 115H655" stroke="#edf1f6" fill="none"/><text x="2" y="18" fill="#a1adbf" font-size="9">60</text><text x="2" y="68" fill="#a1adbf" font-size="9">25</text><text x="2" y="118" fill="#a1adbf" font-size="9">-10</text>${points?`<polyline points="${points}" fill="none" stroke="#5275ec" stroke-width="2.5" stroke-linejoin="round"/>${s.history.length===1?`<circle cx="25" cy="${115-(s.history[0].temperature+10)/70*100}" r="4" fill="#5275ec"/>`:''}`:'<text x="340" y="70" text-anchor="middle" fill="#a1adbf" font-size="12">Biểu đồ xuất hiện sau khi tạo dữ liệu</text>'}`;
 $('#chart-range').textContent=s.history.length?`${s.history.length} mẫu`:'';if(tab==='logs')renderLogs();
}
let refreshing=false;
async function refresh(){if(refreshing)return;refreshing=true;try{render(await api('state'));}catch(e){$('#server-status').textContent='● Mất kết nối Node.js';$('#server-status').style.background='#ffeded';}finally{refreshing=false;}}
refresh();setInterval(refresh,1000);
