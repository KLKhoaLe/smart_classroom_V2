const test=require('node:test'),assert=require('node:assert/strict');
const {evaluate}=require('../../backend/dist/modules/duong-monitoring/evaluate');
const {demoSettings}=require('../../backend/dist/modules/duong-monitoring/setup');
test('Generated n8n Code nodes match evaluator and all connections point at real nodes',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const [flow,file] of [[7,'07_ENVIRONMENT_ALERT_V2_DUONG'],[8,'08_OCCUPANCY_ENERGY_V2_DUONG'],[9,'09_AFTER_HOURS_SECURITY_V2_DUONG']]){
  const d=JSON.parse(fs.readFileSync(path.join(__dirname,'..',file+'.json'),'utf8'));
  for(const n of d.nodes.filter(n=>n.type==='n8n-nodes-base.code'))new Function('$input','$',n.parameters.jsCode);
  const code=d.nodes.find(n=>n.name==='Danh gia WF'+flow).parameters.jsCode;
  const c={telemetry:{id:'t',device_id:'d',event_id:'e',run_id:'r',sequence:1,observed_at:new Date().toISOString(),temperature:38,humidity:85,co2_ppm:1800,power_w:600,occupancy_count:0,door_open:true},policy:{config:{temperature_on:30,humidity_on:75,co2_on:1200,empty_delay_seconds:30}},settings:demoSettings,room:{code:'A101',timezone:'Asia/Ho_Chi_Minh'},schedules:[],state:null,rules_key:'demo',context_hash:'test'};
  const [item]=new Function('$input',code)({first:()=>({json:c})});assert.deepEqual(item.json.evaluation,evaluate(c,flow));
  const names=new Set(d.nodes.map(n=>n.name));for(const [from,outputs] of Object.entries(d.connections)){assert.ok(names.has(from));for(const group of outputs.main)for(const edge of group)assert.ok(names.has(edge.node));}
  assert.equal(d.active,false);assert.ok(!d.nodes.some(n=>n.credentials));
 }
});
