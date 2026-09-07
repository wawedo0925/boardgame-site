export default function UnownedBadge({ isUnowned }: { isUnowned: boolean }) {
  if (isUnowned !== true) return null;
  return <span className="ml-2 inline-block whitespace-nowrap align-middle text-xs font-semibold text-red-400">미보유</span>;
}
