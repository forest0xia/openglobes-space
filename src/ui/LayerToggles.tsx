import { useStore } from '../stores/store';

export function LayerToggles() {
  const showSatellites = useStore((s) => s.showSatellites);
  const showProbes = useStore((s) => s.showProbes);
  const toggleSatellites = useStore((s) => s.toggleSatellites);
  const toggleProbes = useStore((s) => s.toggleProbes);

  const btnBase =
    'px-3 py-1.5 rounded-full text-[11px] border backdrop-blur-lg transition-all duration-300 cursor-pointer whitespace-nowrap';

  return (
    <div className="flex gap-1.5 items-center flex-wrap justify-end">
      <button
        onClick={toggleSatellites}
        className={btnBase}
        style={{
          background: showSatellites ? 'rgba(79,195,247,0.08)' : 'rgba(10,15,40,0.78)',
          borderColor: showSatellites ? '#4FC3F7' : 'rgba(79,195,247,0.15)',
          color: showSatellites ? '#4FC3F7' : '#7B8CA8',
        }}
      >
        🛰 卫星
      </button>
      <button
        onClick={toggleProbes}
        className={btnBase}
        style={{
          background: showProbes ? 'rgba(79,195,247,0.08)' : 'rgba(10,15,40,0.78)',
          borderColor: showProbes ? '#4FC3F7' : 'rgba(79,195,247,0.15)',
          color: showProbes ? '#4FC3F7' : '#7B8CA8',
        }}
      >
        🚀 探测器
      </button>
    </div>
  );
}
