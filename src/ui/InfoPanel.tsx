import { useStore } from '../stores/store';

export function InfoPanel() {
  const focusTarget = useStore((s) => s.focusTarget);
  const clearFocus = useStore((s) => s.clearFocus);

  if (!focusTarget) return null;

  const isPlanet = focusTarget.type === 'planet';

  let name: string;
  let nameCn: string;
  let color: string;
  let fact: string;
  let stats: Record<string, string>;

  if (isPlanet) {
    const d = focusTarget.data;
    name = d.name.toUpperCase();
    nameCn = d.nameCn;
    color = d.color;
    fact = d.fact;
    stats = d.stats;
  } else {
    const d = focusTarget.data;
    name = d.name.toUpperCase();
    nameCn = `${d.nameCn} — ${d.launched}年发射`;
    color = d.color;
    fact = d.desc;
    stats = { 发射年份: String(d.launched), 类型: '🛰 探测器' };
  }

  return (
    <div
      className="fixed z-50 backdrop-blur-[25px] border border-[rgba(79,195,247,0.15)] bg-[rgba(10,15,40,0.78)] p-6 transition-all duration-400 ease-[cubic-bezier(.4,0,.2,1)] animate-slide-in overflow-y-auto
        max-md:right-5 max-md:left-5 max-md:bottom-[130px] max-md:top-auto max-md:w-auto max-md:max-h-[45vh] max-md:rounded-2xl max-md:translate-y-0
        md:right-5 md:top-1/2 md:-translate-y-1/2 md:w-[310px] md:max-h-[80vh] md:rounded-2xl"
    >
      {/* Close button */}
      <button
        onClick={clearFocus}
        className="absolute top-3.5 right-3.5 w-[26px] h-[26px] flex items-center justify-center rounded-full text-[#7B8CA8] hover:text-[#E0E6ED] hover:bg-[rgba(255,255,255,0.05)] transition-all duration-300 text-base border-none bg-transparent cursor-pointer"
      >
        ✕
      </button>

      {/* Name */}
      <div
        className="text-xl font-black tracking-wider mb-1"
        style={{ fontFamily: "'Orbitron', monospace", color }}
      >
        {name}
      </div>
      <div className="text-[13px] text-[#7B8CA8] mb-4 font-light">{nameCn}</div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {Object.entries(stats).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <div className="text-[9px] text-[#7B8CA8] uppercase tracking-wider">{label}</div>
            <div
              className="text-xs text-[#4FC3F7]"
              style={{ fontFamily: "'Orbitron', monospace" }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-[rgba(79,195,247,0.15)] my-3.5" />

      {/* Fact / Description */}
      <div className="text-[9px] text-[#FFB74D] uppercase tracking-[1.5px] mb-1.5 font-medium">
        {isPlanet ? '💡 你知道吗？' : '📡 任务简介'}
      </div>
      <div className="text-xs leading-relaxed text-[#E0E6ED] font-light">{fact}</div>
    </div>
  );
}
