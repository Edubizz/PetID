/**
 * Pure, reusable Health Score calculation for the Pet Health Dashboard.
 * Deliberately simple (starts at 100, deducts for concrete issues) so the
 * result is easy to explain to an owner at a glance. Kept here (rather than
 * inline in a component) so any future surface (pet list, admin, reports)
 * can reuse the exact same rule instead of re-deriving it.
 */

export type HealthScoreInput = {
  /** 0-100. Only applied if `hasActiveTrackers` is true. */
  dailyCompletionPct: number;
  hasActiveTrackers: boolean;
  overdueVaccineCount: number;
  isLost: boolean;
  hasWeightHistory: boolean;
  /** Days since the most recent weight record, or null if none exists. */
  daysSinceLastWeight: number | null;
  hasUpcomingAppointment: boolean;
};

export type HealthScoreStatus = "excellent" | "good" | "attention" | "critical";

export type HealthScoreResult = {
  score: number;
  status: HealthScoreStatus;
  label: string;
  color: string;
};

export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  let score = 100;

  if (input.isLost) score -= 40;

  score -= Math.min(30, input.overdueVaccineCount * 15);

  if (input.hasActiveTrackers) {
    score -= Math.round((1 - input.dailyCompletionPct / 100) * 20);
  }

  if (!input.hasWeightHistory) {
    score -= 5;
  } else if (input.daysSinceLastWeight !== null && input.daysSinceLastWeight > 90) {
    score -= 10;
  }

  if (!input.hasUpcomingAppointment && input.overdueVaccineCount > 0) {
    score -= 5;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score >= 85) return { score, status: "excellent", label: "Excelente", color: "#22C55E" };
  if (score >= 65) return { score, status: "good", label: "Bom", color: "#0EA5E9" };
  if (score >= 40) return { score, status: "attention", label: "Precisa de atenção", color: "#F59E0B" };
  return { score, status: "critical", label: "Crítico", color: "#EF4444" };
}
