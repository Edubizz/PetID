import { jsPDF } from "jspdf";
import type { PetReport } from "@/lib/pet-reports";
import { REPORT_PERIODS } from "@/lib/pet-reports";
import { formatDate } from "@/lib/pet-utils";

/**
 * Builds a professional, veterinarian-ready PDF from an already-computed
 * `PetReport` — no extra fetches, no AI. Charts are drawn as simple vector
 * shapes (no canvas/html2canvas dependency) so the PDF stays crisp and light.
 */

export type PdfPet = {
  name: string;
  breed?: string | null;
  photo_url?: string | null;
};

export type PdfVaccine = { name: string; applied_at: string | null; next_dose: string | null };
export type PdfAppointment = {
  scheduled_at: string;
  reason: string | null;
  vet_name: string | null;
  clinic: string | null;
};
export type PdfTimelineItem = { title: string; date: string };

export type ExportPetReportPdfInput = {
  pet: PdfPet;
  ownerName?: string | null;
  report: PetReport;
  vaccines: PdfVaccine[];
  appointments: PdfAppointment[];
  timelineHighlights: PdfTimelineItem[];
};

const MARGIN = 40;
const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = "#1E293B";
const MUTED = "#64748B";
const BRAND = "#1E3A8A";
const ACCENT = "#22C55E";
const LINE = "#E2E8F0";

async function tryLoadImageDataUrl(
  url: string,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const format = blob.type.includes("png") ? "PNG" : "JPEG";
    return { dataUrl, format };
  } catch {
    return null;
  }
}

class PdfCursor {
  doc: jsPDF;
  y = MARGIN;

  constructor(doc: jsPDF) {
    this.doc = doc;
  }

  ensureSpace(height: number) {
    if (this.y + height > PAGE_H - MARGIN) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  sectionTitle(text: string) {
    this.ensureSpace(28);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12.5);
    this.doc.setTextColor(BRAND);
    this.doc.text(text.toUpperCase(), MARGIN, this.y);
    this.y += 6;
    this.doc.setDrawColor(LINE);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 16;
  }

  paragraph(text: string, opts: { size?: number; color?: string; bold?: boolean } = {}) {
    const size = opts.size ?? 10;
    this.doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(opts.color ?? INK);
    const lines = this.doc.splitTextToSize(text, CONTENT_W) as string[];
    this.ensureSpace(lines.length * (size * 1.3));
    this.doc.text(lines, MARGIN, this.y);
    this.y += lines.length * (size * 1.3) + 4;
  }

  bulletList(items: string[]) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10);
    this.doc.setTextColor(INK);
    for (const item of items) {
      const lines = this.doc.splitTextToSize(`•  ${item}`, CONTENT_W) as string[];
      this.ensureSpace(lines.length * 13.5 + 2);
      this.doc.text(lines, MARGIN, this.y);
      this.y += lines.length * 13.5 + 2;
    }
    this.y += 6;
  }

  spacer(h: number) {
    this.y += h;
  }
}

function drawStatGrid(cursor: PdfCursor, stats: { label: string; value: string }[]) {
  const cols = 4;
  const cellW = CONTENT_W / cols;
  const cellH = 52;
  cursor.ensureSpace(cellH + 10);
  const rows = Math.ceil(stats.length / cols);
  cursor.ensureSpace(rows * cellH);
  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * cellW;
    const y = cursor.y + row * cellH;
    cursor.doc.setFillColor("#F1F5F9");
    cursor.doc.roundedRect(x + 4, y, cellW - 8, cellH - 10, 6, 6, "F");
    cursor.doc.setFont("helvetica", "bold");
    cursor.doc.setFontSize(16);
    cursor.doc.setTextColor(BRAND);
    cursor.doc.text(s.value, x + 14, y + 24);
    cursor.doc.setFont("helvetica", "normal");
    cursor.doc.setFontSize(8.5);
    cursor.doc.setTextColor(MUTED);
    cursor.doc.text(s.label, x + 14, y + 36, { maxWidth: cellW - 24 });
  });
  cursor.y += rows * cellH + 12;
}

function drawBarChart(
  cursor: PdfCursor,
  points: { label: string; value: number }[],
  opts: { max?: number; suffix?: string } = {},
) {
  if (points.length === 0) return;
  const h = 90;
  cursor.ensureSpace(h + 24);
  const chartTop = cursor.y;
  const chartW = CONTENT_W;
  const barGap = 2;
  const barW = Math.max(1.5, chartW / points.length - barGap);
  const max = opts.max ?? Math.max(1, ...points.map((p) => p.value));

  cursor.doc.setDrawColor(LINE);
  cursor.doc.line(MARGIN, chartTop + h, MARGIN + chartW, chartTop + h);

  points.forEach((p, i) => {
    const x = MARGIN + i * (barW + barGap);
    const barH = Math.max(1, (p.value / max) * (h - 6));
    cursor.doc.setFillColor(p.value >= max * 0.99 ? ACCENT : BRAND);
    cursor.doc.roundedRect(x, chartTop + h - barH, barW, barH, 1, 1, "F");
  });

  const step = Math.max(1, Math.ceil(points.length / 8));
  cursor.doc.setFont("helvetica", "normal");
  cursor.doc.setFontSize(6.5);
  cursor.doc.setTextColor(MUTED);
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    const x = MARGIN + i * (barW + barGap);
    cursor.doc.text(p.label, x, chartTop + h + 10);
  });

  cursor.y = chartTop + h + 20;
}

function drawLineChart(cursor: PdfCursor, points: { label: string; value: number }[]) {
  if (points.length < 2) return;
  const h = 80;
  cursor.ensureSpace(h + 24);
  const chartTop = cursor.y;
  const chartW = CONTENT_W;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const range = max - min || 1;

  cursor.doc.setDrawColor(LINE);
  cursor.doc.line(MARGIN, chartTop + h, MARGIN + chartW, chartTop + h);

  cursor.doc.setDrawColor(BRAND);
  cursor.doc.setLineWidth(1.4);
  const coords = points.map((p, i) => {
    const x = MARGIN + (i / (points.length - 1)) * chartW;
    const y = chartTop + h - ((p.value - min) / range) * (h - 10) - 4;
    return [x, y] as const;
  });
  for (let i = 0; i < coords.length - 1; i++) {
    cursor.doc.line(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
  }
  cursor.doc.setLineWidth(1);
  cursor.doc.setFillColor(BRAND);
  for (const [x, y] of coords) cursor.doc.circle(x, y, 1.6, "F");

  cursor.doc.setFont("helvetica", "normal");
  cursor.doc.setFontSize(6.5);
  cursor.doc.setTextColor(MUTED);
  cursor.doc.text(points[0].label, MARGIN, chartTop + h + 10);
  cursor.doc.text(points[points.length - 1].label, MARGIN + chartW - 24, chartTop + h + 10);

  cursor.y = chartTop + h + 20;
}

export async function exportPetReportPdf(input: ExportPetReportPdfInput): Promise<void> {
  const { pet, ownerName, report, vaccines, appointments, timelineHighlights } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const cursor = new PdfCursor(doc);
  const periodLabel =
    REPORT_PERIODS.find((p) => p.value === report.periodDays)?.label ?? `${report.periodDays} dias`;

  // ---- Header ----
  doc.setFillColor(BRAND);
  doc.rect(0, 0, PAGE_W, 92, "F");

  const photo = pet.photo_url ? await tryLoadImageDataUrl(pet.photo_url) : null;
  const photoSize = 60;
  const photoX = MARGIN;
  const photoY = 16;
  if (photo) {
    doc.saveGraphicsState();
    doc.addImage(photo.dataUrl, photo.format, photoX, photoY, photoSize, photoSize);
    doc.restoreGraphicsState();
  } else {
    doc.setFillColor("#FFFFFF33");
    doc.roundedRect(photoX, photoY, photoSize, photoSize, 10, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor("#FFFFFF");
    doc.text(
      pet.name.slice(0, 1).toUpperCase(),
      photoX + photoSize / 2 - 7,
      photoY + photoSize / 2 + 8,
    );
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#FFFFFF");
  doc.text(`Relatório de ${pet.name}`, photoX + photoSize + 16, photoY + 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#DBEAFE");
  const subtitleParts = [pet.breed, ownerName ? `Tutor: ${ownerName}` : null].filter(Boolean);
  doc.text(subtitleParts.join(" • ") || " ", photoX + photoSize + 16, photoY + 40);
  doc.text(
    `${periodLabel} • Gerado em ${formatDate(new Date().toISOString())}`,
    photoX + photoSize + 16,
    photoY + 56,
  );

  cursor.y = 92 + 26;

  // ---- Summary ----
  cursor.sectionTitle("Resumo do período");
  const stats: { label: string; value: string }[] = [
    { label: "Conclusão hoje", value: `${report.completionPct}%` },
    { label: "Média de conclusão", value: `${report.averageCompletionPct}%` },
    { label: "Maior sequência", value: `${report.longestStreak} dias` },
    { label: "Sequência atual", value: `${report.currentStreak} dias` },
  ];
  for (const c of report.categories) {
    stats.push({ label: `${c.label} (média/dia)`, value: `${c.averagePerDay} ${c.unit}` });
  }
  if (report.medicationAdherencePct !== null) {
    stats.push({ label: "Adesão à medicação", value: `${report.medicationAdherencePct}%` });
  }
  drawStatGrid(cursor, stats);

  if (report.hasAnyTrackers && report.completionByDay.some((p) => p.value > 0)) {
    cursor.sectionTitle("Conclusão por dia");
    drawBarChart(cursor, report.completionByDay, { max: 100 });
  }

  if (report.weight && report.weight.trend.length >= 2) {
    cursor.sectionTitle("Tendência de peso");
    drawLineChart(
      cursor,
      report.weight.trend.map((p) => ({ label: p.label, value: p.value })),
    );
    cursor.paragraph(
      `Peso atual: ${report.weight.latestKg} kg` +
        (report.weight.changeKg !== null
          ? ` (${report.weight.changeKg > 0 ? "+" : ""}${report.weight.changeKg} kg no período)`
          : ""),
      { size: 9.5, color: MUTED },
    );
  }

  for (const c of report.categories.filter(
    (cat) => cat.category === "water" || cat.category === "exercise",
  )) {
    if (c.trend.every((p) => p.value === 0)) continue;
    cursor.sectionTitle(`Tendência — ${c.label}`);
    drawBarChart(cursor, c.trend);
  }

  // ---- Health observations ----
  if (report.observations.length > 0) {
    cursor.sectionTitle("Observações de saúde");
    cursor.bulletList(report.observations);
  }

  // ---- Milestones ----
  if (report.milestones.length > 0) {
    cursor.sectionTitle("Marcos e conquistas");
    cursor.bulletList(
      report.milestones.map((m) => `${m.achieved ? "✓" : "…"} ${m.title} — ${m.description}`),
    );
  }

  // ---- Vaccines ----
  const appliedVaccines = vaccines.filter((v) => v.applied_at);
  if (appliedVaccines.length > 0) {
    cursor.sectionTitle("Vacinas");
    cursor.bulletList(
      appliedVaccines.map((v) => {
        const applied = formatDate(v.applied_at);
        const next = v.next_dose ? ` • próxima dose: ${formatDate(v.next_dose)}` : "";
        return `${v.name} — aplicada em ${applied}${next}`;
      }),
    );
  }

  // ---- Appointments ----
  if (appointments.length > 0) {
    cursor.sectionTitle("Consultas");
    cursor.bulletList(
      appointments
        .slice(0, 10)
        .map(
          (a) =>
            `${formatDate(a.scheduled_at)} — ${a.reason ?? "Consulta veterinária"}${a.vet_name ? ` (${a.vet_name})` : ""}`,
        ),
    );
  } else {
    cursor.sectionTitle("Consultas");
    cursor.paragraph("Não houve consultas registradas no período.", { size: 9.5, color: MUTED });
  }

  // ---- Timeline highlights ----
  if (timelineHighlights.length > 0) {
    cursor.sectionTitle("Destaques da linha do tempo");
    cursor.bulletList(
      timelineHighlights.slice(0, 8).map((t) => `${formatDate(t.date)} — ${t.title}`),
    );
  }

  // ---- Footer disclaimer on every page ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, PAGE_H - 32, PAGE_W - MARGIN, PAGE_H - 32);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(BRAND);
    doc.text("PetID", MARGIN, PAGE_H - 20);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED);
    doc.text(
      "— relatório informativo gerado automaticamente, não substitui avaliação veterinária.",
      MARGIN + 26,
      PAGE_H - 20,
    );
    doc.text(`${i}/${pageCount}`, PAGE_W - MARGIN - 20, PAGE_H - 20);
  }

  doc.save(`relatorio-${pet.name.toLowerCase().replace(/\s+/g, "-")}-${report.periodDays}d.pdf`);
}
