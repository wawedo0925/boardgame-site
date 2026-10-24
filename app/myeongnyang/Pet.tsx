export default function Pet({ cat }: { cat: boolean }) {
 return <svg viewBox="0 0 120 110" role="img" aria-label={cat ? "고양이" : "강아지"}>
  {cat ? <><path d="M22 49 18 9 49 29M71 29 102 9 98 49" fill="#f3b3c9" stroke="#633d4b" strokeWidth="3"/><path d="m26 31-2-13 14 12m44 0 14-12-2 13" fill="#ffe8ef"/></> : <><ellipse cx="24" cy="48" rx="17" ry="32" transform="rotate(18 24 48)" fill="#b97d50"/><ellipse cx="96" cy="48" rx="17" ry="32" transform="rotate(-18 96 48)" fill="#b97d50"/></>}
  <ellipse cx="60" cy="60" rx="43" ry="39" fill={cat ? "#ffe4ee" : "#ffe1ad"} stroke={cat ? "#633d4b" : "#71513a"} strokeWidth="2.5"/>
  {!cat && <ellipse cx="40" cy="50" rx="14" ry="17" fill="#c68b5b"/>}
  <ellipse cx="40" cy="56" rx="5" ry="7" fill="#342834"/><ellipse cx="80" cy="56" rx="5" ry="7" fill="#342834"/>
  <circle cx="42" cy="53" r="2" fill="white"/><circle cx="82" cy="53" r="2" fill="white"/>
  <ellipse cx="29" cy="72" rx="9" ry="5" fill="#f3a2a8" opacity=".6"/><ellipse cx="91" cy="72" rx="9" ry="5" fill="#f3a2a8" opacity=".6"/>
  <path d="M54 69 Q60 65 66 69 L60 75Z" fill="#68404a"/><path d="M60 74q-9 13-15 3m15-3q9 13 15 3" fill="none" stroke="#68404a" strokeWidth="2.5" strokeLinecap="round"/>
  {cat && <path d="m12 65 18 3m-19 8 19-2m60-6 18-3m-18 9 19 2" stroke="#633d4b" strokeWidth="2" strokeLinecap="round"/>}
  <path d="M44 98 60 93 76 98 60 106Z" fill={cat ? "#d074b6" : "#7dbfaf"}/>
 </svg>;
}
