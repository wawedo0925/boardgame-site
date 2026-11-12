export function isSaboteur(name?: string | null) {
  return ["사보타지", "사보타지딜럭스", "사보타지디럭스"].includes((name ?? "").replace(/\s/g, ""));
}
