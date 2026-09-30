import TichuClient from "./TichuClient";

export const metadata = { title: "티츄" };

export default function TichuPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#17251f_0%,#090b0a_48%,#050606_100%)] text-zinc-100">
      <TichuClient />
    </div>
  );
}
