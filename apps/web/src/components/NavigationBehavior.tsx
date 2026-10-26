import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
const positions = new Map<string,number>();
export default function NavigationBehavior() {
  const location=useLocation(), kind=useNavigationType();
  useLayoutEffect(() => {
    const previous=window.history.scrollRestoration;
    window.history.scrollRestoration='manual';
    return () => {window.history.scrollRestoration=previous;};
  },[]);
  useLayoutEffect(() => {
    if (location.hash) return;
    const target=kind==='POP' ? positions.get(location.key) ?? 0 : 0;
    let frame=0, timer=0, done=false;
    // A shorter destination can clamp scroll before React cleans up this listener.
    // Only remember coordinates while this history entry is still the active one.
    const store=() => {
      const activeKey=window.history.state?.key ?? 'default';
      if(done && activeKey===location.key) positions.set(location.key,window.scrollY);
    };
    const restore=() => {
      if (done) return;
      window.scrollTo(0,target);
      if (Math.abs(window.scrollY-target)<4) {done=true;observer.disconnect();}
    };
    const observer=new ResizeObserver(() => {cancelAnimationFrame(frame);frame=requestAnimationFrame(restore);});
    observer.observe(document.body);frame=requestAnimationFrame(restore);
    const stop=() => {done=true;observer.disconnect();};
    timer=window.setTimeout(stop,5000);
    window.addEventListener('scroll',store,{passive:true});
    document.addEventListener('click',store,true);
    window.addEventListener('wheel',stop,{once:true,passive:true});
    window.addEventListener('touchstart',stop,{once:true,passive:true});
    return () => {
      if(positions.size>60) positions.delete(positions.keys().next().value!);
      cancelAnimationFrame(frame);clearTimeout(timer);observer.disconnect();
      window.removeEventListener('scroll',store);document.removeEventListener('click',store,true);window.removeEventListener('wheel',stop);window.removeEventListener('touchstart',stop);
    };
  },[location.key,location.hash,kind]);
  return null;
}
