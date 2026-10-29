// Matches T3 client-runtime/state/threadSort.ts for the pinned and manual active sections.
const time=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
const keyOrder=(a,b)=>a<b?-1:a>b?1:0;
export function sortSidebarThreads(threads){
  return [...threads].sort((a,b)=>{
    const pinnedA=Boolean(a.pinnedAt),pinnedB=Boolean(b.pinnedAt);
    if(pinnedA!==pinnedB)return pinnedA?-1:1;
    const key=pinnedA?'pinOrderKey':'activeOrderKey';
    const keyedA=a[key]!=null,keyedB=b[key]!=null;
    if(keyedA!==keyedB)return pinnedA?(keyedA?-1:1):(keyedA?1:-1);
    const order=keyedA?keyOrder(a[key],b[key]):pinnedA?time(b.createdAt)-time(a.createdAt):Math.max(time(b.createdAt),time(b.unsettledAt))-Math.max(time(a.createdAt),time(a.unsettledAt));
    return order||String(a.id).localeCompare(String(b.id));
  });
}
