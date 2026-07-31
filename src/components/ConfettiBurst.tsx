import { useMemo } from "react";

const COLORS = ["#F59E0B", "#22C55E", "#6366F1", "#EC4899", "#0EA5E9", "#EF4444"];

/**
 * Small celebratory burst used when a household/pet hits 100% completion.
 * Pure CSS animation (see `.animate-confetti-fall` in styles.css) — no
 * external confetti dependency needed.
 */
export function ConfettiBurst({ pieces = 24 }: { pieces?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        drift: (Math.random() - 0.5) * 120,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    [pieces],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {items.map((c) => (
        <span
          key={c.id}
          className="animate-confetti-fall absolute top-0 rounded-sm"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size * 0.4,
            backgroundColor: c.color,
            animationDelay: `${c.delay}s`,
            ["--confetti-drift" as string]: `${c.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
