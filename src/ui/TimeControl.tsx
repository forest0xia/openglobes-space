import { useStore } from '../stores/store';

const SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];

export function TimeControl() {
  const timeSpeed = useStore((s) => s.timeSpeed);
  const isPaused = useStore((s) => s.isPaused);
  const setTimeSpeed = useStore((s) => s.setTimeSpeed);
  const togglePause = useStore((s) => s.togglePause);
  const clearFocus = useStore((s) => s.clearFocus);

  const changeSpeed = (dir: number) => {
    let idx = SPEED_PRESETS.indexOf(timeSpeed);
    if (idx === -1) idx = 3;
    idx = Math.max(0, Math.min(SPEED_PRESETS.length - 1, idx + dir));
    setTimeSpeed(SPEED_PRESETS[idx]);
  };

  const formatSpeed = (s: number) => (s >= 1 ? `${Math.round(s)}x` : `${s.toFixed(2)}x`);

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-2 rounded-full backdrop-blur-xl border border-[rgba(79,195,247,0.15)] bg-[rgba(10,15,40,0.78)]">
      <button
        onClick={() => changeSpeed(-1)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[#7B8CA8] hover:text-[#4FC3F7] hover:border-[rgba(79,195,247,0.15)] hover:bg-[rgba(79,195,247,0.05)] border border-transparent transition-all duration-300 text-base"
      >
        ⏪
      </button>

      <button
        onClick={togglePause}
        className="w-8 h-8 rounded-full flex items-center justify-center border border-transparent transition-all duration-300 text-base"
        style={{
          color: isPaused ? '#7B8CA8' : '#4FC3F7',
          background: isPaused ? 'transparent' : 'rgba(79,195,247,0.1)',
          borderColor: isPaused ? 'transparent' : '#4FC3F7',
        }}
      >
        {isPaused ? '▶' : '⏸'}
      </button>

      <button
        onClick={() => changeSpeed(1)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[#7B8CA8] hover:text-[#4FC3F7] hover:border-[rgba(79,195,247,0.15)] hover:bg-[rgba(79,195,247,0.05)] border border-transparent transition-all duration-300 text-base"
      >
        ⏩
      </button>

      <input
        type="range"
        min="-3"
        max="5"
        step="0.5"
        value={Math.log2(timeSpeed)}
        onChange={(e) => setTimeSpeed(Math.pow(2, parseFloat(e.target.value)))}
        className="w-24 h-[3px] appearance-none bg-[rgba(79,195,247,0.2)] rounded-sm outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#4FC3F7] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(79,195,247,0.5)]"
      />

      <div
        className="min-w-[60px] text-center text-xs tracking-wider"
        style={{ fontFamily: "'Orbitron', monospace", color: '#4FC3F7' }}
      >
        {formatSpeed(timeSpeed)}
      </div>

      <button
        onClick={clearFocus}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[#7B8CA8] hover:text-[#4FC3F7] hover:border-[rgba(79,195,247,0.15)] hover:bg-[rgba(79,195,247,0.05)] border border-transparent transition-all duration-300 text-base"
        title="Reset view"
      >
        ⟳
      </button>
    </div>
  );
}
