import React from 'react';

interface InfoPanelProps {
  infoRef: React.RefObject<HTMLDivElement | null>;
  iNameRef: React.RefObject<HTMLDivElement | null>;
  iSubRef: React.RefObject<HTMLDivElement | null>;
  iGridRef: React.RefObject<HTMLDivElement | null>;
  iFactRef: React.RefObject<HTMLDivElement | null>;
  iExtrasRef: React.RefObject<HTMLDivElement | null>;
  infoHint: boolean;
}

export function InfoPanel({ infoRef, iNameRef, iSubRef, iGridRef, iFactRef, iExtrasRef, infoHint }: InfoPanelProps) {
  return (
    <>
      {/* Info hint icon — appears when an object is selected, click to open details */}
      {infoHint && (
        <button className="info-hint" onClick={() => (window as any).__openInfo()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
      )}

      <div className="info" ref={infoRef}>
        <div className="info-drag" onPointerDown={(e) => {
          e.preventDefault();
          const el = infoRef.current!;
          const rect = el.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const offsetY = e.clientY - rect.top;
          el.classList.add('dragging');
          // Snap to current visual position immediately (remove CSS transform)
          el.style.left = rect.left + 'px';
          el.style.top = rect.top + 'px';
          el.style.right = 'auto';
          el.style.transform = 'none';
          const onMove = (ev: PointerEvent) => {
            ev.preventDefault();
            el.style.left = (ev.clientX - offsetX) + 'px';
            el.style.top = (ev.clientY - offsetY) + 'px';
          };
          const onUp = () => {
            el.classList.remove('dragging');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }} />
        <button className="info-close" onClick={() => {
          // Reset position on close
          const el = infoRef.current!;
          el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.transform = '';
          (window as any).__closeInfo();
        }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <div ref={iNameRef} className="info-name" />
        <div ref={iSubRef} className="info-sub" />
        <div ref={iGridRef} className="info-grid" />
        <div className="info-line" />
        <div className="info-fact-tag">✦ 你知道吗</div>
        <div ref={iFactRef} className="info-fact" />
        <div ref={iExtrasRef} />
      </div>
    </>
  );
}
