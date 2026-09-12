"use client";

import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

// Keep the world point under the fingers fixed while the board changes size.
export default function useClocktowerPinch(viewport: RefObject<HTMLDivElement | null>, scale: number, setZoom: (value: number) => void, editing: boolean, cancelDrag: () => void) {
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number; x: number; y: number } | null>(null);
  const single = useRef<{ x: number; y: number; left: number; top: number; card: boolean } | null>(null);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    if (!pendingScroll.current || !viewport.current) return;
    viewport.current.scrollTo({...pendingScroll.current, behavior: 'instant'});
    pendingScroll.current = null;
  }, [scale, viewport]);

  function pair() {
    const [a, b] = [...fingers.current.values()];
    return { x: (a.x+b.x)/2, y: (a.y+b.y)/2, distance: Math.max(1, Math.hypot(a.x-b.x,a.y-b.y)) };
  }
  function start(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch' || !viewport.current) return;
    const element = viewport.current;
    fingers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if (fingers.current.size === 1) {
      suppressClick.current = false;
      single.current = {x:e.clientX,y:e.clientY,left:element.scrollLeft,top:element.scrollTop,card:editing && e.target instanceof Element && !!e.target.closest('button')};
    } else {
      cancelDrag();
      single.current = null;
      suppressClick.current = true;
      const p=pair(), rect=element.getBoundingClientRect();
      gesture.current={distance:p.distance,scale,x:(element.scrollLeft+p.x-rect.left)/scale,y:(element.scrollTop+p.y-rect.top)/scale};
      for (const id of fingers.current.keys()) element.setPointerCapture(id);
      e.stopPropagation();
    }
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!fingers.current.has(e.pointerId) || !viewport.current) return;
    const element=viewport.current;
    fingers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if (fingers.current.size >= 2 && gesture.current) {
      e.preventDefault();e.stopPropagation();cancelDrag();
      const p=pair(), g=gesture.current, rect=element.getBoundingClientRect();
      const next=Math.max(0.25,Math.min(2.5,g.scale*p.distance/g.distance));
      const offset={left:g.x*next-(p.x-rect.left),top:g.y*next-(p.y-rect.top)};
      pendingScroll.current=next === scale ? null : offset;
      element.scrollTo({...offset, behavior: 'instant'});
      setZoom(next);
    } else if (single.current && !single.current.card) {
      const s=single.current;
      if (Math.hypot(e.clientX-s.x,e.clientY-s.y)>6 || suppressClick.current) {
        suppressClick.current=true;
        element.setPointerCapture(e.pointerId);
        element.scrollTo({left:s.left+s.x-e.clientX,top:s.top+s.y-e.clientY,behavior:'instant'});
        e.preventDefault();e.stopPropagation();
      }
    } else if (suppressClick.current) {
      e.preventDefault();e.stopPropagation();
    }
  }
  function end(e: ReactPointerEvent<HTMLDivElement>) {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.delete(e.pointerId);
    gesture.current=null;single.current=null;
    if (suppressClick.current) {cancelDrag();e.stopPropagation();}
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return {
    onPointerDownCapture:start, onPointerMoveCapture:move,
    onPointerUpCapture:end, onPointerCancelCapture:end,
    onClickCapture:(e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressClick.current && e.detail !== 0) {e.preventDefault();e.stopPropagation();}
    },
  };
}
