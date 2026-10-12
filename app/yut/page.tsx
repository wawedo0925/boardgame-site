import YutClient from "./YutClient";

export const metadata = { title: "윷놀이" };

export default function YutPage() {
  return (
    <div className="min-h-dvh bg-[#090e0c] text-zinc-100" style={{ colorScheme: "dark" }}>
      <YutClient />
    </div>
  );
}
