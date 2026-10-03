// Per-process budget caps provider spend without trusting spoofable forwarded IPs.
export function createRateLimiter(limit=30,windowMs=60000) {
  let start=0,count=0;
  return (now=Date.now())=> {if(now-start>=windowMs){start=now;count=0;} return ++count<=limit;};
}
export const allowRequest=createRateLimiter();
