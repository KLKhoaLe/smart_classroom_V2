// Run at repository root: node n8n-workflows/duong/build.cjs
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const {evaluate}=require(path.join(root,'backend/dist/modules/duong-monitoring/evaluate'));
const names={7:'07_ENVIRONMENT_ALERT_V2_DUONG',8:'08_OCCUPANCY_ENERGY_V2_DUONG',9:'09_AFTER_HOURS_SECURITY_V2_DUONG'};
for(const flow of [7,8,9]){
 const nodes=[],connections={};
 const node=(name,type,parameters,position,version=1,extra={})=>nodes.push({id:randomUUID(),name,type:'n8n-nodes-base.'+type,typeVersion:version,parameters,position,...extra});
 const code=(name,js,x,y)=>node(name,'code',{jsCode:js},[x,y],2);
 const link=(a,b,output=0)=>{connections[a]??={main:[]};connections[a].main[output]??=[];connections[a].main[output].push({node:b,type:'main',index:0});};
 const iff=(name,expression,x,y)=>node(name,'if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:randomUUID(),leftValue:expression,rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},[x,y],2.2);
 const http=(name,url,x,y,body)=>node(name,'httpRequest',{...(body?{method:'POST',sendBody:true,specifyBody:'json',jsonBody:body}:{}),url,options:{timeout:15000}},[x,y],4.2);
 node('Chay thu thu cong','manualTrigger',{},[0,0]);
 node('Nhan tu WF01','executeWorkflowTrigger',{inputSource:'passthrough'},[0,180],1.1);
 node('Webhook demo local','webhook',{httpMethod:'POST',path:`duong-monitoring-${String(flow).padStart(2,'0')}`,responseMode:'lastNode',options:{}},[0,360],2,{webhookId:randomUUID()});
 code('Cau hinh',`const raw=$input.first().json; const d=raw.body??raw;
return [{json:{flow:${flow},backend_base_url:'http://host.docker.internal:3001/api',device_ref:'ESP32_A101',
telemetry_id:d.telemetry_id??d.telemetry?.id??null,email_enabled:false,email_to:''}}];`,240,180);
 iff('Co telemetry_id?',"={{ Boolean($json.telemetry_id) }}",480,180);
 http('Doc telemetry moi nhat',"={{ $json.backend_base_url + '/telemetry?device_id=' + encodeURIComponent($json.device_ref) }}",720,360);
 code('Chon telemetry da luu',`const rows=$input.all().flatMap(x=>Array.isArray(x.json)?x.json:[x.json]);
if(!rows.length||!rows[0].id)throw new Error('Chưa có telemetry. Chạy simulator HTTP hoặc script demo trước.');
return [{json:{...$('Cau hinh').first().json,telemetry_id:rows[0].id}}];`,960,360);
 http('Doc policy lich va trang thai',`={{ $('Cau hinh').first().json.backend_base_url + '/duong-monitoring/context/${flow}/' + $json.telemetry_id }}`,1200,180);
 code('Danh gia WF'+flow,`${evaluate.toString()}
const c=$input.first().json;
const result=evaluate(c,${flow});
if(result.status==='REJECTED')throw new Error(result.reason);
return [{json:{flow:${flow},telemetry_id:c.telemetry.id,context_hash:c.context_hash,evaluation:result}}];`,1440,180);
 http('Luu ket qua nguyen tu',"={{ $('Cau hinh').first().json.backend_base_url + '/duong-monitoring/commit' }}",1680,180,'={{ $json }}');
 iff('Gui email bo sung?',"={{ $('Cau hinh').first().json.email_enabled === true && $json.created === true && $json.new_events.length > 0 }}",1920,180);
 code('Soan email',String.raw`const r=$input.first().json;
const to=$('Cau hinh').first().json.email_to;
if(!to||!to.includes('@'))throw new Error('Điền email_to trong Cau hinh trước khi bật email.');
return [{json:{to,subject:'[Smart Classroom][WF${flow}] '+r.room_code+' - '+r.new_events.map(e=>e.recovered?'Phục hồi '+e.type:e.type).join(', '),
message:r.new_events.map(e=>e.reason+'\nThời gian: '+e.observed_at+'\n'+JSON.stringify(e.evidence)).join('\n\n')}}];`,2160,0);
 node('Gui Gmail bo sung','gmail',{sendTo:'={{ $json.to }}',subject:'={{ $json.subject }}',emailType:'text',message:'={{ $json.message }}',options:{}},[2400,0],2.2,{onError:'continueRegularOutput',disabled:true});
 code('Ket qua email',`const mail=$input.first().json;return [{json:{...$('Luu ket qua nguyen tu').first().json,
email_status:mail.id&&!mail.error?'SENT':'FAILED_OR_UNCERTAIN',email_error:mail.error??null}}];`,2640,0);
 code('Dau ra ban giao',`return [{json:{...$input.first().json,email_status:'NOT_SENT'}}];`,2160,300);
 node('Doc truoc khi chay','stickyNote',{width:1040,height:300,content:`## WF${flow} — BẢN LOCAL CHỜ REVIEW CONTRACT\nCài backend/module + migration trong gói này trước. API /duong-monitoring/* là API mới đề xuất, không phải API sẵn có của nhóm.\nCau hinh: backend_base_url; email_enabled=false mặc định; email_to khi cần. Chọn Gmail credential của bạn. Không kèm secrets.\nBackend API_TOKEN bật: chọn Header Auth trên cả 3 HTTP Request node.\nManual lấy telemetry mới nhất đã lưu; mẫu quá 30s bị từ chối. Webhook demo và WF01 nhận {telemetry_id}.\nState/proposal/event được lưu thật qua một transaction. Events chờ WF10; WF03 chưa đọc proposal. Không tự tạo command/ACK/incident.\nEmail là kênh bổ sung cho transition mới, tắt retry tự động; kiểm tra Executions khi lỗi. Mất response sau gửi có thể gây trạng thái chưa chắc chắn; không cam kết exactly-once email.\nWebhook chỉ dùng demo local; phải thêm xác thực trước khi public.`},[500,-300]);
 for(const x of ['Chay thu thu cong','Nhan tu WF01','Webhook demo local'])link(x,'Cau hinh');
 link('Cau hinh','Co telemetry_id?');link('Co telemetry_id?','Doc policy lich va trang thai',0);
 link('Co telemetry_id?','Doc telemetry moi nhat',1);link('Doc telemetry moi nhat','Chon telemetry da luu');
 link('Chon telemetry da luu','Doc policy lich va trang thai');link('Doc policy lich va trang thai','Danh gia WF'+flow);
 link('Danh gia WF'+flow,'Luu ket qua nguyen tu');link('Luu ket qua nguyen tu','Gui email bo sung?');
 link('Gui email bo sung?','Soan email',0);link('Gui email bo sung?','Dau ra ban giao',1);
 link('Soan email','Gui Gmail bo sung');link('Gui Gmail bo sung','Ket qua email');
 fs.writeFileSync(path.join(root,'n8n-workflows',names[flow]+'.json'),JSON.stringify({name:names[flow],nodes,connections,active:false,settings:{executionOrder:'v1'},pinData:{}},null,2)+'\n');
}
console.log('Đã tạo 3 JSON từ cùng mã evaluate của backend.');
