/** Minúsculas, sin tildes y con espacios simples, para comparar nombres */
function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nombre completo sin repetir apellidos. En Velneo, `name` de las usuarias suele traer ya
 * los apellidos (y el de las trabajadoras no): solo se añade cada apellido que falte.
 * Devuelve '' si no hay ningún dato.
 */
export function formatPersonName(name?: string | null, ape1?: string | null, ape2?: string | null): string {
  const parts = [(name ?? '').trim()].filter(Boolean);
  for (const ape of [ape1, ape2]) {
    const surname = (ape ?? '').trim();
    if (!surname) continue;
    const current = ` ${normalizeName(parts.join(' '))} `;
    if (!current.includes(` ${normalizeName(surname)} `)) parts.push(surname);
  }
  return parts.join(' ');
}
