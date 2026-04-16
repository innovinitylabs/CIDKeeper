"use client";

type Props = {
  label?: string;
  /** 0–100 when set; omit or pass null for indeterminate */
  value?: number | null;
};

export function ProgressBar({ label, value }: Props) {
  const determinate = typeof value === "number" && !Number.isNaN(value);
  const clamped = determinate ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div className="w-full space-y-2">
      {label ? <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p> : null}
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {determinate ? (
          <div
            className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 ease-out dark:bg-emerald-500"
            style={{ width: `${clamped}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-600/80 dark:bg-emerald-500/80" />
        )}
      </div>
    </div>
  );
}
