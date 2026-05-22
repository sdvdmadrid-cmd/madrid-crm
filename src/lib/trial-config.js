/**
 * Single source for free-trial length (days). Override with TRIAL_DAYS env.
 */
export const TRIAL_DAYS = Math.max(
  1,
  Math.min(
    90,
    Number(process.env.TRIAL_DAYS || process.env.NEXT_PUBLIC_TRIAL_DAYS || 15),
  ),
);

export function trialEndFromNow(baseDate = new Date()) {
  const start = baseDate instanceof Date ? baseDate.getTime() : Date.now();
  return new Date(start + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function trialDaysLabel() {
  return `${TRIAL_DAYS} days`;
}
