export function buildShiftDateTimesUtc(input: {
  shiftDate: string;
  startTime: string;
  endTime: string;
}): { startsAtIso: string; endsAtIso: string } {
  const startsAtIso = `${input.shiftDate}T${input.startTime}:00Z`;
  const startDate = new Date(startsAtIso);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Invalid shift start date/time ${input.shiftDate} ${input.startTime}`);
  }

  const endDate = new Date(`${input.shiftDate}T${input.endTime}:00Z`);
  if (Number.isNaN(endDate.getTime())) {
    throw new Error(`Invalid shift end date/time ${input.shiftDate} ${input.endTime}`);
  }

  if (endDate.getTime() <= startDate.getTime()) {
    endDate.setUTCDate(endDate.getUTCDate() + 1);
  }

  return {
    startsAtIso: startDate.toISOString(),
    endsAtIso: endDate.toISOString(),
  };
}
