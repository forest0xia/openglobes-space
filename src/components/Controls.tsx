import { useRef, useEffect } from 'react';

// Settings stepper — pure DOM, no React state, no continuous onChange
export function CfgStepper({ label, min, max, step, cfgKey }: { label: string; min: number; max: number; step: number; cfgKey: string }) {
  const valRef = useRef<HTMLSpanElement>(null);
  const cfg = (window as any).__cfg;
  const update = (dir: number) => {
    if (!cfg) return;
    const v = Math.round(Math.max(min, Math.min(max, (cfg[cfgKey] ?? 0) + dir * step)) * 1000) / 1000;
    cfg[cfgKey] = v;
    if (valRef.current) valRef.current.textContent = String(v);
  };
  return (
    <div className="stepper-row">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctrl">
        <button className="stepper-btn" onClick={() => update(-1)}>−</button>
        <span className="stepper-val" ref={valRef}>{cfg?.[cfgKey] ?? 0}</span>
        <button className="stepper-btn" onClick={() => update(1)}>+</button>
      </div>
    </div>
  );
}

export function VolStepper({ label, min, max, step, defaultValue, onChange }: { label: string; min: number; max: number; step: number; defaultValue: number; onChange: (v: number) => void }) {
  const valRef = useRef<HTMLSpanElement>(null);
  const curRef = useRef(defaultValue);
  const update = (dir: number) => {
    const v = Math.round(Math.max(min, Math.min(max, curRef.current + dir * step)) * 1000) / 1000;
    curRef.current = v;
    onChange(v);
    if (valRef.current) valRef.current.textContent = String(v);
  };
  return (
    <div className="stepper-row">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctrl">
        <button className="stepper-btn" onClick={() => update(-1)}>−</button>
        <span className="stepper-val" ref={valRef}>{defaultValue}</span>
        <button className="stepper-btn" onClick={() => update(1)}>+</button>
      </div>
    </div>
  );
}

// Toggle that reads/writes window.__cfg — survives panel remount
export function CfgToggle({ label, cfgKey, onToggle }: { label: string; cfgKey: string; onToggle?: () => void }) {
  const cfg = (window as any).__cfg;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.checked = cfg?.[cfgKey] ?? false;
  });
  return (
    <label className="mobile-toggle">
      <input type="checkbox" ref={inputRef} onChange={() => {
        if (onToggle) {
          // onToggle handles both local var and cfg
          onToggle();
        } else {
          // No callback — toggle cfg directly
          if (cfg) cfg[cfgKey] = !cfg[cfgKey];
        }
        // Sync checkbox with cfg (onToggle may have changed it)
        if (inputRef.current && cfg) inputRef.current.checked = cfg[cfgKey];
      }} />
      <span>{label}</span>
    </label>
  );
}
