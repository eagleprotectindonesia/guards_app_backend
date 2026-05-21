export function getAnnualLeaveEligibilityDate(dateOfJoining: Date): Date {
  const eligibilityDate = new Date(dateOfJoining);
  eligibilityDate.setUTCHours(0, 0, 0, 0);
  eligibilityDate.setUTCFullYear(eligibilityDate.getUTCFullYear() + 1);
  return eligibilityDate;
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function startOfYearUtc(year: number) {
  return new Date(Date.UTC(year, 0, 1));
}

function endOfYearUtc(year: number) {
  return new Date(Date.UTC(year, 11, 31));
}

function daysInclusiveUtc(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
}

export function computeAnnualLeaveEntitledDays(params: { dateOfJoining: Date; year: number }) {
  const { dateOfJoining, year } = params;
  const eligibilityDate = getAnnualLeaveEligibilityDate(dateOfJoining);
  const eligibilityYear = eligibilityDate.getUTCFullYear();

  if (year < eligibilityYear) return 0;
  if (year > eligibilityYear) return 12;

  const cycleEnd = endOfYearUtc(year);
  const cycleStart = startOfYearUtc(year);
  const effectiveStart = eligibilityDate.getTime() < cycleStart.getTime() ? cycleStart : eligibilityDate;
  const totalDays = isLeapYear(year) ? 366 : 365;
  const remainingDays = daysInclusiveUtc(effectiveStart, cycleEnd);
  return Math.floor((12 * remainingDays) / totalDays);
}

