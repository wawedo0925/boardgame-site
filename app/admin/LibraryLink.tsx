import Link from "next/link";

export default function LibraryLink() {
  return (
    <Link
      href="/admin/library"
      className="block rounded-2xl border border-violet-900 bg-violet-950/30 p-6 transition hover:border-violet-500"
    >
      <p className="text-xs font-bold tracking-widest text-violet-400">LIBRARY REGISTRATION</p>
      <h2 className="mt-2 text-xl font-black text-white">게임 자료 등록</h2>
      <p className="mt-2 text-sm text-zinc-400">
        새 보드게임과 머더미스터리 정보·표지를 등록합니다.
      </p>
    </Link>
  );
}
