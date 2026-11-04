// T011: RoughBorder — wraps a widget in a hand-drawn SVG border using roughjs (FR-020, US4/US6).
// Renders when `rough` prop is true (i.e. the canvas's showGuides is on); otherwise renders
// children with no wrapper. The SVG is absolutely positioned behind the content.
import { useRef, useEffect, useState } from 'react';
import rough from 'roughjs';

export interface RoughBorderProps {
  readonly rough: boolean;
  readonly children: React.ReactNode;
  /** 'rectangle' (default) or 'ellipse' for radio/circle widgets. */
  readonly shape?: 'rectangle' | 'ellipse';
}

export function RoughBorder({ rough: enabled, children, shape = 'rectangle' }: RoughBorderProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !enabled) return;
    setDims({ w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) });
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setDims({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !dims || !svgRef.current) return;
    const svg = svgRef.current;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rc = rough.svg(svg, { options: { roughness: 1.2, bowing: 0.8, stroke: 'currentColor', strokeWidth: 1.2 } });
    const pad = 3;
    const el =
      shape === 'ellipse'
        ? rc.ellipse(dims.w / 2, dims.h / 2, dims.w - pad, dims.h - pad)
        : rc.rectangle(pad, pad, dims.w - pad * 2, dims.h - pad * 2);
    svg.appendChild(el);
  }, [enabled, dims, shape]);

  if (!enabled) return <>{children}</>;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      {dims && (
        <svg
          ref={svgRef}
          aria-hidden="true"
          width={dims.w}
          height={dims.h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
        />
      )}
      {children}
    </div>
  );
}
