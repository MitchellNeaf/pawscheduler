export function isExpired(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const d = new Date(dateStr);
  return d < today;
}

export function isExpiringSoon(dateStr, days = 30) {
  if (!dateStr) return false;
  const today = new Date();
  const d = new Date(dateStr);

  const diff = (d - today) / (1000 * 60 * 60 * 24); // days
  return diff >= 0 && diff <= days;
}

export function getRabiesRecord(records) {
  if (!records || records.length === 0) return null;
  return records.find((r) => r.shot_type.toLowerCase() === "rabies") || null;
}
