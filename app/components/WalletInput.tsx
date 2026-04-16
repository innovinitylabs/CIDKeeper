"use client";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function WalletInput({ value, onChange, onSubmit, disabled }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">Wallet address</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-emerald-500/30 placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </label>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
      >
        Fetch NFTs
      </button>
    </div>
  );
}
