"use client";

type Props = {
  name: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export default function SignedScoreInput({ name, value, disabled, onChange }: Props) {
  const negative = value.startsWith("-");
  return <div className="mt-2 flex items-center gap-2">
    <button
      type="button"
      disabled={disabled}
      aria-label={`${name} 마이너스 점수`}
      aria-pressed={negative}
      title="마이너스 점수 켜기/끄기"
      onClick={() => onChange(negative ? value.slice(1) : `-${value}`)}
      className={`h-11 w-11 shrink-0 rounded-xl border text-xl font-bold disabled:opacity-50 ${negative ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-white/20 bg-white/5 text-zinc-300"}`}
    >−</button>
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${name} 점수`}
      disabled={disabled}
      value={value}
      onChange={event => {
        const next = event.target.value.replace(/,/g, ".");
        if (/^-?\d*(?:\.\d*)?$/.test(next)) onChange(next);
      }}
      placeholder="점수 입력"
      className="h-14 min-w-0 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 text-right text-2xl font-bold"
    />
  </div>;
}
