// Camera timestamps can repeat/reset with virtual cameras and driver changes.
// Schedule and timestamp processed frames using the Worker's monotonic clock.
export function createFrameClock(fps=20){
 let lastArrival=-Infinity,lastTimestamp=-1;
 return now=>{
  if(!Number.isFinite(now)||now-lastArrival<1000/fps)return null;
  lastArrival=now;
  lastTimestamp=Math.max(lastTimestamp+1,Math.round(now*1000));
  return lastTimestamp;
 };
}
