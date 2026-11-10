/** Up to two letters for an avatar: first and last word of the name ("Ada Lovelace" → "AL"), else from the email. */
export function initialsOf(name: string, email: string) {
  const words = (name.trim() || email.split("@")[0]).split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase() || "?";
}
