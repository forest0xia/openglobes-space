import { useStore } from '../stores/store';

export function LoadingScreen() {
  const isLoaded = useStore((s) => s.isLoaded);

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center transition-opacity duration-800"
      style={{
        background: '#030014',
        opacity: isLoaded ? 0 : 1,
        pointerEvents: isLoaded ? 'none' : 'auto',
      }}
    >
      <div className="w-[50px] h-[50px] border-2 border-[rgba(79,195,247,0.1)] border-t-[#4FC3F7] rounded-full animate-spin" />
      <div
        className="mt-5 text-[11px] text-[#4FC3F7] tracking-[6px] animate-pulse"
        style={{ fontFamily: "'Orbitron', monospace" }}
      >
        INITIALIZING
      </div>
    </div>
  );
}
