import { PLANETS } from '../data/planets';
import { useStore } from '../stores/store';

export function PlanetNav() {
  const setFocusTarget = useStore((s) => s.setFocusTarget);
  const focusTarget = useStore((s) => s.focusTarget);

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1 max-md:hidden">
      {PLANETS.map((planet, idx) => {
        const isActive =
          focusTarget?.type === 'planet' && focusTarget.index === idx;
        const label = planet.nameCn.split('—')[0].trim();

        return (
          <button
            key={planet.id}
            onClick={() => setFocusTarget({ type: 'planet', data: planet, index: idx })}
            className="group relative flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all duration-300 bg-[rgba(10,15,40,0.5)]"
            style={{
              borderColor: isActive ? '#4FC3F7' : 'transparent',
              boxShadow: isActive ? '0 0 12px rgba(79,195,247,0.2)' : 'none',
            }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full transition-transform duration-300 group-hover:scale-130"
              style={{
                background: planet.color,
                boxShadow: `0 0 6px ${planet.color}`,
              }}
            />
            <span className="absolute left-[42px] text-[11px] font-medium text-[#7B8CA8] whitespace-nowrap opacity-0 -translate-x-1 transition-all duration-300 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
