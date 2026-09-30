export function isScotlandYard(name?: string | null) {
  const normalized = (name ?? "").toLowerCase().replace(/[\s·:_-]+/g, "");
  return normalized === "스코틀랜드야드" || normalized === "scotlandyard";
}
