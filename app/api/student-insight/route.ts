import { z } from 'zod';
import { students } from '@/lib/data';
import { getThreshold } from '@/lib/attendance';
import { studentInsight } from '@/lib/service';
import { allowRequest } from '@/lib/rate-limit';
export const runtime='nodejs';
const schema=z.object({query:z.string().trim().min(2).max(120).refine(s=>!/[\x00-\x1f\x7f]/.test(s),'Invalid control characters'),year:z.enum(['2nd Year','3rd Year']).optional()}).strict();
const headers={'Cache-Control':'no-store'};
function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    if (host && originUrl.host === host) return true;
    if (originUrl.origin === new URL(request.url).origin) return true;
    const isLocalOrigin = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
    const isLocalHost = !host || host.startsWith('localhost') || host.startsWith('127.0.0.1');
    return isLocalOrigin && isLocalHost;
  } catch {
    return false;
  }
}

export async function POST(request:Request) {
  if(!isAllowedOrigin(request)) return Response.json({kind:'error',error:'Cross-origin requests are not allowed.'},{status:403,headers});
  if(!allowRequest()) return Response.json({kind:'error',error:'Too many searches. Please try again in one minute.'},{status:429,headers:{...headers,'Retry-After':'60'}});
  if(!request.headers.get('content-type')?.includes('application/json')) return Response.json({kind:'error',error:'Use application/json.'},{status:415,headers});
  try {
    // Bounded stream read also protects requests without Content-Length.
    const reader=request.body?.getReader(); if(!reader) throw new Error('empty');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return Response.json({kind:'error',error:'Request is too large.'},{status:413,headers});}chunks.push(value);}
    const raw=Buffer.concat(chunks).toString('utf8');
    const parsed=schema.safeParse(JSON.parse(raw));
    if(!parsed.success) return Response.json({kind:'error',error:'Enter a name, full registration number, or email (2–120 characters), and a valid year.'},{status:400,headers});
    let threshold:number;
    try {threshold=getThreshold();} catch {return Response.json({kind:'error',error:'The server attendance threshold is misconfigured.'},{status:503,headers});}
    const result=await studentInsight(students,parsed.data.query,parsed.data.year,threshold);
    return Response.json(result,{status:result.kind==='error'?404:200,headers});
  } catch {return Response.json({kind:'error',error:'Unable to process the request. Send a valid JSON search.'},{status:400,headers});}
}
