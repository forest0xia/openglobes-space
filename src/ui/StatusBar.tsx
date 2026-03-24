import { useStore } from '../stores/store';

export function StatusBar() {
  const showProbes = useStore((s) => s.showProbes);

  return (
    <div className="fixed bottom-16 left-5 z-50 text-[11px] text-[#7B8CA8] tracking-wide max-md:left-1/2 max-md:-translate-x-1/2 max-md:bottom-[70px] max-md:whitespace-nowrap">
      <span className="opacity-70">
        {showProbes && (
          <>🛰 正在追踪 15 个深空探测器 · 旅行者1号距地球 ~164 AU</>
        )}
        {!showProbes && <>🌌 太阳系实时可视化</>}
      </span>
    </div>
  );
}
