import React from 'react';
import { SPEED_PRESETS } from '../config/constants';

interface TimebarProps {
  playBtnRef: React.RefObject<HTMLButtonElement | null>;
  tSliderRef: React.RefObject<HTMLDivElement | null>;
  spdTxtRef: React.RefObject<HTMLDivElement | null>;
}

export function Timebar({ playBtnRef, tSliderRef, spdTxtRef }: TimebarProps) {
  return (
    <div className="timebar">
      <button className="tb on" ref={playBtnRef} onClick={() => (window as any).__togglePlay()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg></button>
      <div className="speed-dial" ref={tSliderRef} onPointerDown={e => {
        e.preventDefault();
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const setFromX = (x: number) => {
          const frac = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
          (window as any).__spdSlider(String(frac));
        };
        setFromX(e.clientX);
        const onMove = (ev: PointerEvent) => { ev.preventDefault(); setFromX(ev.clientX); };
        const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }}>
        <div className="speed-dial-track">
          {SPEED_PRESETS.map((_, i) => (
            <div key={i} className="speed-dial-tick" style={{ left: `${(i / (SPEED_PRESETS.length - 1)) * 100}%`, height: i % 3 === 0 ? 10 : 6 }} />
          ))}
        </div>
        <div className="speed-dial-thumb" ref={el => {
          if (el) (window as any).__spdThumb = el;
        }} />
      </div>
      <div className="tspeed" ref={spdTxtRef}>1分/秒</div>
      <button className="tb" onClick={() => (window as any).__resetCam()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  );
}
