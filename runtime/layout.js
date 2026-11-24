// Pure layout functions: no GNOME dependencies. All coordinates are logical pixels.
export const LIMIT = 4;
export const defaultRatios = () => ({main: .5, first: .5, second: .5});
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function monitorOrder(monitors, primary) {
    return [...monitors].sort((a,b) => a.index === b.index ? 0 : a.index === primary ? -1 : b.index === primary ? 1 : a.x-b.x || a.y-b.y || a.index-b.index).map(m=>m.index);
}
export function candidates(order, count) {
    return [...order].filter(m=>count(m)<LIMIT).sort((a,b)=>count(a)-count(b)||order.indexOf(a)-order.indexOf(b));
}
export function tiles(area, count, outer=8, inner=8, ratios=defaultRatios()) {
    if (!Number.isInteger(count)||count<0||count>LIMIT) throw Error('Invalid tile count');
    if (!count) return [];
    const o = Math.max(0, Math.min(Math.round(outer), Math.floor((Math.min(area.width,area.height)-1)/2)));
    const r={x:area.x+o,y:area.y+o,width:Math.max(1,area.width-2*o),height:Math.max(1,area.height-2*o)};
    const portrait=area.height>area.width;
    function split(rect, horizontal, ratio) {
        const size=horizontal?rect.width:rect.height;
        const gap=clamp(Math.round(inner),0,Math.max(0,size-2));
        const available=Math.max(2,size-gap);
        const a=clamp(Math.round(available*clamp(ratio,.15,.85)),1,available-1);
        const b=available-a;
        return horizontal?[{...rect,width:a},{...rect,x:rect.x+a+gap,width:b}]:[{...rect,height:a},{...rect,y:rect.y+a+gap,height:b}];
    }
    if(count===1)return [r];
    const [a,b]=split(r,!portrait,ratios.main);
    if(count===2)return [a,b];
    const [a1,a2]=split(a,portrait,ratios.first);
    if(count===3)return [a1,b,a2];
    const [b1,b2]=split(b,portrait,ratios.second);
    return [a1,b1,a2,b2];
}
export function contains(r,x,y){return x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height;}
export function sameRect(a,b,tolerance=1){return ['x','y','width','height'].every(k=>Math.abs(a[k]-b[k])<=tolerance);}
export function directionalIndex(rects, index, dx, dy) {
    const r=rects[index]; if(!r)return -1;
    const cx=r.x+r.width/2,cy=r.y+r.height/2;
    let best=-1,score=Infinity;
    rects.forEach((t,i)=>{if(i===index)return;const x=t.x+t.width/2-cx,y=t.y+t.height/2-cy;
        const forward=x*dx+y*dy,side=Math.abs(x*dy-y*dx);
        if(forward>0&&forward+side*3<score){best=i;score=forward+side*3;}});
    return best;
}
// Convert the changed inner edge of a resized tile to split ratios.
export function resizedRatios(area, rects, index, after, outer, gap, previous) {
    const old=rects[index]; if(!old||rects.length<2)return {...previous};
    const portrait=area.height>area.width, result={...previous};
    const xEnd=r=>r.x+r.width,yEnd=r=>r.y+r.height;
    const changed=(a,b)=>Math.abs(a-b)>2;
    const mainSize=(portrait?area.height:area.width)-2*outer-gap;
    const crossSize=(portrait?area.width:area.height)-2*outer-gap;
    if(mainSize<=0||crossSize<=0)return result;
    const first=index%2===0;
    const start=portrait?area.y:area.x;
    const edge=portrait?(first?yEnd(after):after.y):(first?xEnd(after):after.x);
    const oldEdge=portrait?(first?yEnd(old):old.y):(first?xEnd(old):old.x);
    if(changed(edge,oldEdge))result.main=clamp((edge-start-outer-(first?0:gap))/mainSize,.15,.85);
    const hasCross=first?rects.length>=3:rects.length===4;
    if(hasCross){const top=index<2, crossStart=portrait?area.x:area.y;
        const e=portrait?(top?xEnd(after):after.x):(top?yEnd(after):after.y);
        const p=portrait?(top?xEnd(old):old.x):(top?yEnd(old):old.y);
        if(changed(e,p))result[first?'first':'second']=clamp((e-crossStart-outer-(top?0:gap))/crossSize,.15,.85);
    }
    return result;
}

// A single focus outline can occupy the gap at a time. Reserve its outward extent
// on each boundary so active-to-neighbor spacing never drops below the setting.
export function hintOffset(width) {return Math.max(0,Math.min(2,Math.round(width/2)));}
export function effectiveGaps(outer,inner,width,enabled=true) {
    const offset=enabled?hintOffset(width):0;
    return {outer:outer+offset,inner:inner+offset,offset};
}
export function hintRect(frame,width) {const o=hintOffset(width);return {x:frame.x-o,y:frame.y-o,width:frame.width+2*o,height:frame.height+2*o};}
