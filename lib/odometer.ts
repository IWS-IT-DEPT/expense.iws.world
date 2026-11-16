/** Pure odometer rules — safe to import from client components. */

/** Largest single entry we accept: catches a mistyped digit before it becomes a big reimbursement. */
export const MAX_TRIP_MILES = 1500;

export type OdometerResult =
  | { ok: true; driven: number; personal: number; business: number }
  | { ok: false; error: string };

/** One set of rules for the odometer figures, shared by the form and the server. */
export function checkOdometer(startRaw: string, endRaw: string, personalRaw: string, noteRaw: string): OdometerResult {
  const start = Number(startRaw.replace(/,/g, ""));
  const end = Number(endRaw.replace(/,/g, ""));
  if (startRaw.trim() === "" || !Number.isFinite(start) || start < 0) {
    return { ok: false, error: "Enter the odometer reading you started at." };
  }
  if (endRaw.trim() === "" || !Number.isFinite(end) || end < 0) {
    return { ok: false, error: "Enter the odometer reading you ended at." };
  }
  if (end <= start) return { ok: false, error: "The ending odometer must be higher than the starting one." };
  const driven = Math.round((end - start) * 10) / 10;
  if (driven > MAX_TRIP_MILES) {
    return { ok: false, error: `That's ${driven.toLocaleString("en-US")} miles in one entry — check both readings.` };
  }
  const personal = personalRaw.trim() === "" ? 0 : Number(personalRaw.replace(/,/g, ""));
  if (!Number.isFinite(personal) || personal < 0) return { ok: false, error: "Personal miles must be zero or more." };
  if (personal > 0 && noteRaw.trim() === "") {
    return { ok: false, error: "Say what the personal miles were for, so Payroll can follow it." };
  }
  const business = Math.round((driven - personal) * 10) / 10;
  if (business <= 0) return { ok: false, error: "Personal miles can't be all of the miles driven." };
  return { ok: true, driven, personal, business };
}
