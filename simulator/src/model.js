export const sensorSpec = {
  temperature: [-10, 60, 0.1, 27], humidity: [0, 100, 1, 55],
  light_percent: [0, 100, 1, 65], occupancy_count: [0, 100, 1, 12],
  co2_ppm: [300, 5000, 10, 650], power_w: [0, 20000, 10, 420],
  pm25_ug_m3: [0, 500, 1, 12], water_l_min: [0, 100, 0.1, 0]
};
export const initialSensors = () => ({ ...Object.fromEntries(Object.entries(sensorSpec).map(([k,v])=>[k,v[3]])), door_open: false });
export const initialDevices = () => ({ FAN:'OFF', LIGHT:'OFF', VENTILATION:'OFF', DEHUMIDIFIER:'OFF' });
export const scenarios = [
 {id:'normal',name:'Lớp học bình thường',description:'Có người, môi trường ổn định.',values:{temperature:27,humidity:55,light_percent:65,occupancy_count:12,co2_ppm:650,power_w:420,door_open:false}},
 {id:'hot',name:'Phòng nóng, có người',description:'Nhiệt độ 34°C, 25 người. Kiểm tra điều khiển quạt.',values:{temperature:34,humidity:62,occupancy_count:25,co2_ppm:900,power_w:850}},
 {id:'empty',name:'Phòng trống, còn tốn điện',description:'Không có người nhưng công suất vẫn 900 W.',values:{occupancy_count:0,power_w:900,door_open:false}},
 {id:'humid',name:'Độ ẩm cao',description:'Độ ẩm 86%. Kiểm tra luồng môi trường.',values:{humidity:86,temperature:29,occupancy_count:8}},
 {id:'co2',name:'Không khí ngột ngạt',description:'CO₂ 1.800 ppm, 35 người trong phòng.',values:{co2_ppm:1800,occupancy_count:35,temperature:30}},
 {id:'dark',name:'Phòng thiếu sáng',description:'Độ sáng 12%, có người cần sử dụng.',values:{light_percent:12,occupancy_count:15}},
 {id:'door',name:'Cửa mở bất thường',description:'Cửa mở khi không có người. Giờ ngoài lịch do n8n kiểm tra.',values:{door_open:true,occupancy_count:0}},
 {id:'after-hours',name:'Cửa mở ngoài giờ',description:'Cửa mở, phòng trống; chạy ngoài lịch để kiểm tra WF09 → WF10.',values:{door_open:true,occupancy_count:0}},
 {id:'leak',name:'Nước chảy khi phòng trống',description:'Kịch bản mở rộng: 8 lít/phút.',values:{water_l_min:8,occupancy_count:0}},
 {id:'timeline',name:'Một buổi học • 90 giây',description:'0s bình thường → 30s nóng/đông → 60s phòng trống → 90s dừng timeline.',timeline:true}
];
export const defaults = () => ({ mode:'preview', room_code:'A101', device_code:'ESP32_A101', device_id:'', interval_ms:5000, heartbeat_ms:30000, poll_ms:2000,
 telemetry_url:'',heartbeat_url:'',ack_url:'',claim_url:'', jitter:false,
 faults:{offline:false,drop_ack:false,fail_command:false}, sensors:initialSensors() });
export function validateSensors(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dữ liệu cảm biến phải là object.');
 const result={};
 for(const [k,v] of Object.entries(input)) {
  if(k==='door_open') { if(typeof v!=='boolean') throw new Error('door_open phải là boolean.'); result[k]=v; continue; }
  const spec=sensorSpec[k];
  if(!spec || typeof v!=='number' || !Number.isFinite(v) || v<spec[0] || v>spec[1] || (k==='occupancy_count'&&!Number.isInteger(v))) throw new Error(`Giá trị không hợp lệ: ${k}`);
  result[k]=v;
 }
 return result;
}
export function validateConfig(input, current) {
 const next=structuredClone(current);
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Cấu hình không hợp lệ.');
 for(const [k,v] of Object.entries(input)) {
  if(['telemetry_url','heartbeat_url','ack_url','claim_url'].includes(k)) {
   if(typeof v!=='string' || v.length>2048) throw new Error('URL không hợp lệ.');
   if(v) {const u=new URL(v); if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Chỉ hỗ trợ URL HTTP(S), không chứa mật khẩu.');}
   next[k]=v;
  } else if(['room_code','device_code','device_id'].includes(k)) {
   if(typeof v!=='string'||v.length>100||(k!=='device_id'&&!/^[\w-]+$/.test(v)))throw new Error(`Không hợp lệ: ${k}`); next[k]=v;
  } else if(['interval_ms','heartbeat_ms','poll_ms'].includes(k)) {
   if(!Number.isInteger(v)||v<1000||v>300000)throw new Error('Chu kỳ phải từ 1 đến 300 giây.'); next[k]=v;
  } else if(k==='mode') {if(!['preview','http'].includes(v))throw new Error('Sai mode.');next[k]=v;
  } else if(k==='jitter') {if(typeof v!=='boolean')throw new Error('jitter phải là boolean.');next[k]=v;
  } else if(k==='faults') {for(const [f,b] of Object.entries(v||{})){if(!Object.hasOwn(next.faults,f)||typeof b!=='boolean')throw new Error('Sai tùy chọn lỗi.');next.faults[f]=b;}
  } else if(k==='sensors') next.sensors={...next.sensors,...validateSensors(v)};
  else throw new Error(`Trường cấu hình không được hỗ trợ: ${k}`);
 }
 return next;
}
