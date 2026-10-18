// Optional local HTTP fixture. No decisions/rules; never pretends to be n8n.
import http from 'node:http';
const server=http.createServer(async(req,res)=>{
 if(req.method!=='POST'||!['/telemetry','/heartbeat','/ack'].includes(req.url)){res.writeHead(404);res.end();return;}
 try{let text='';for await(const chunk of req){text+=chunk;if(text.length>65536)throw new Error('Payload too large');}const data=JSON.parse(text);
 console.log(new Date().toISOString(),req.url,JSON.stringify(data));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,receiver:'LOCAL_TEST_ONLY',event_id:data.event_id,command_id:data.command_id}));
 }catch(e){res.writeHead(400);res.end(e.message);}
});
server.listen(4311,'127.0.0.1',()=>console.log('Receiver thử nghiệm: http://localhost:4311 — chỉ nhận/log HTTP, KHÔNG phải n8n, không tự bật thiết bị.'));
