import { LayerToggles } from './LayerToggles';

export function TopBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3.5 bg-gradient-to-b from-[rgba(3,0,20,0.92)] to-transparent pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-[#4FC3F7] shadow-[0_0_12px_#4FC3F7] animate-pulse" />
        <span
          className="text-[13px] font-bold tracking-[4px] text-[#4FC3F7] uppercase"
          style={{ fontFamily: "'Orbitron', monospace" }}
        >
          此刻太空
        </span>
      </div>
      <div className="pointer-events-auto">
        <LayerToggles />
      </div>
    </div>
  );
}
