// Camera timestamps can repeat/reset with virtual cameras and driver changes.
// Schedule and timestamp processed frames using the Worker's monotonic clock.
export function createFrameClock(fps=20){
 const interval=1000/fps;let nextArrival=-Infinity,lastTimestamp=-1;
 return now=>{
  if(!Number.isFinite(now)||now+0.001<nextArrival)return null;
  // Keep the cadence, rather than waiting a full interval from each arrival.
  // A 24 fps camera otherwise drops every other frame with a 20 fps limit.
  nextArrival=now-nextArrival>interval?now+interval:nextArrival+interval;
  lastTimestamp=Math.max(lastTimestamp+1,Math.round(now*1000));
  return lastTimestamp;
 };
}
