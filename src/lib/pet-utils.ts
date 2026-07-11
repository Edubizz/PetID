export function computeAge(birthDate: string | null | undefined): string {
  if (!birthDate) return "—";
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return "—";
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0 && months <= 0) return "recém-nascido";
  if (years <= 0) return `${months} ${months === 1 ? "mês" : "meses"}`;
  if (months === 0) return `${years} ${years === 1 ? "ano" : "anos"}`;
  return `${years}a ${months}m`;
}

export function formatDate(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", opts);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeFromNow(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value).getTime();
  const now = Date.now();
  const diffDays = Math.round((d - now) / 86400000);
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanhã";
  if (diffDays === -1) return "ontem";
  if (diffDays > 0 && diffDays < 30) return `em ${diffDays} dias`;
  if (diffDays < 0 && diffDays > -30) return `há ${-diffDays} dias`;
  if (diffDays >= 30) return `em ${Math.round(diffDays / 30)} meses`;
  return `há ${Math.round(-diffDays / 30)} meses`;
}