/**
 * Lightweight pre-launch guard for unresolved legal items.
 * Run: npx tsx scripts/check-legal-readiness.ts
 */
import {
  LEGAL_LAUNCH_TODOS,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_ACTIVE,
  TERMS_VERSION,
  PRIVACY_VERSION,
  isLegalIdentityComplete,
  legalLaunchChecklist,
  unresolvedLegalPlaceholders,
} from "../src/lib/legal";

const items = legalLaunchChecklist();
const unresolved = unresolvedLegalPlaceholders();

console.log("PetID legal launch checklist");
console.log("============================");
console.log(`Versions: Terms ${TERMS_VERSION} · Privacy ${PRIVACY_VERSION}`);
console.log("");
for (const item of items) {
  console.log(`${item.ok ? "OK  " : "TODO"}  [${item.id}] ${item.detail}`);
}
console.log("");
console.log("Documented launch TODOs:");
for (const t of LEGAL_LAUNCH_TODOS) {
  console.log(`  - [${t.id}] ${t.detail}`);
}
console.log("");
console.log(`Support email: ${SUPPORT_EMAIL} (active=${SUPPORT_EMAIL_ACTIVE})`);
console.log(`Unresolved identity tokens (${unresolved.length}):`);
for (const p of unresolved) console.log(`  - ${p}`);
console.log("");
if (isLegalIdentityComplete() && items.every((i) => i.ok)) {
  console.log("All automated legal checklist items OK — human review still required separately.");
  process.exit(0);
} else {
  console.log("LEGAL LAUNCH BLOCKERS REMAIN — do not mark legal review as completed.");
  process.exit(1);
}
