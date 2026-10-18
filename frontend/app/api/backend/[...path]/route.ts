import {NextRequest,NextResponse} from 'next/server';
const getPaths=new Set(['dashboard','rooms','devices','commands','telemetry','incidents','reports','health']);
async function proxy(req:NextRequest,context:{params:Promise<{path:string[]}>}){
 const {path}=await context.params;const route=path.join('/');
 if(req.method==='GET'?!getPaths.has(route):route!=='commands/manual')return NextResponse.json({error:'Endpoint không được phép qua frontend.'},{status:404});
 if(req.method==='POST'&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Origin không hợp lệ.'},{status:403});
 try{const r=await fetch(`${process.env.BACKEND_URL||'http://127.0.0.1:3001'}/api/${route}`,{method:req.method,headers:{'content-type':'application/json',...(process.env.API_TOKEN?{authorization:'Bearer '+process.env.API_TOKEN}:{})},...(req.method==='POST'?{body:await req.text()}:{}),cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
  return new NextResponse(await r.text(),{status:r.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch{return NextResponse.json({error:'Không kết nối được backend.'},{status:503});}
}
export const GET=proxy;export const POST=proxy;
