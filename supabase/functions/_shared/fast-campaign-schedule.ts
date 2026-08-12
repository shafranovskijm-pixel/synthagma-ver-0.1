export interface FastCampaignSlot {
  email: string;
  senderIndex: number;
  dayIndex: number;
  slotIndex: number;
  notBefore: string;
}

export interface FastCampaignScheduleInput {
  emails: string[];
  senderCount: number;
  startDateMsk: string;
  days?: number;
  windowStartHourMsk?: number;
  windowEndHourMsk?: number;
  slotMinutes?: number;
  perSenderDailyCap?: number;
  minimumSenderGapMinutes?: number;
}

const MSK_OFFSET_MINUTES = 180;

function parseMskStart(date: string, hour: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("startDateMsk must be YYYY-MM-DD");
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), hour, 0, 0) -
    MSK_OFFSET_MINUTES * 60_000;
}

export function buildFastCampaignSchedule({
  emails,
  senderCount,
  startDateMsk,
  days = 2,
  windowStartHourMsk = 9,
  windowEndHourMsk = 20,
  slotMinutes = 30,
  perSenderDailyCap = 2,
  minimumSenderGapMinutes = 300,
}: FastCampaignScheduleInput): FastCampaignSlot[] {
  if (!Number.isInteger(senderCount) || senderCount < 1) throw new Error("senderCount must be positive");
  if (!Number.isInteger(days) || days < 1) throw new Error("days must be positive");
  if (windowEndHourMsk <= windowStartHourMsk) throw new Error("invalid send window");
  if (slotMinutes < 1 || 60 % slotMinutes !== 0) throw new Error("slotMinutes must divide an hour");
  if (perSenderDailyCap < 1) throw new Error("perSenderDailyCap must be positive");

  const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const dailyCapacity = senderCount * perSenderDailyCap;
  if (normalized.length > dailyCapacity * days) {
    throw new Error(`capacity exceeded: ${normalized.length} recipients, ${dailyCapacity * days} available`);
  }

  const slotsPerDay = ((windowEndHourMsk - windowStartHourMsk) * 60) / slotMinutes;
  const minimumGapSlots = Math.ceil(minimumSenderGapMinutes / slotMinutes);
  if (minimumGapSlots >= slotsPerDay && perSenderDailyCap > 1) {
    throw new Error("minimum sender gap does not fit the send window");
  }
  const dayZero = parseMskStart(startDateMsk, windowStartHourMsk);
  const result: FastCampaignSlot[] = [];
  const allowedPairs: Array<[number, number]> = [];
  for (let first = 0; first < slotsPerDay; first += 1) {
    for (let second = first + minimumGapSlots; second < slotsPerDay; second += 1) {
      allowedPairs.push([first, second]);
    }
  }

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const dayEmails = normalized.slice(dayIndex * dailyCapacity, (dayIndex + 1) * dailyCapacity);
    if (!dayEmails.length) break;
    const bySender = Array.from({ length: senderCount }, () => [] as string[]);
    dayEmails.forEach((email, index) => bySender[index % senderCount].push(email));
    const loads = Array.from({ length: slotsPerDay }, () => 0);

    bySender.forEach((senderEmails, senderIndex) => {
      if (!senderEmails.length) return;
      if (senderEmails.length > 2) {
        throw new Error("only up to two daily jobs per sender are supported by fast mode");
      }
      let chosenSlots: number[];
      if (senderEmails.length === 1) {
        const minimumLoad = Math.min(...loads);
        const candidates = loads
          .map((load, slot) => ({ load, slot }))
          .filter((entry) => entry.load === minimumLoad);
        chosenSlots = [candidates[senderIndex % candidates.length].slot];
      } else {
        let best: { pair: [number, number]; score: number[] } | null = null;
        allowedPairs.forEach((pair, pairIndex) => {
          const [first, second] = pair;
          const score = [
            Math.max(loads[first] + 1, loads[second] + 1),
            loads[first] + loads[second],
            Math.abs(loads[first] - loads[second]),
            (pairIndex - senderIndex * 7 + allowedPairs.length) % allowedPairs.length,
          ];
          const better = !best || score.some((value, index) => value < best!.score[index]
            && score.slice(0, index).every((prior, priorIndex) => prior === best!.score[priorIndex]));
          if (better) best = { pair, score };
        });
        if (!best) throw new Error("unable to allocate sender slots");
        chosenSlots = best.pair;
      }

      chosenSlots.forEach((slotIndex, index) => {
        loads[slotIndex] += 1;
        const slotBase = dayZero + dayIndex * 86_400_000 + slotIndex * slotMinutes * 60_000;
        const withinSlotOffset = Math.floor((senderIndex * slotMinutes * 60_000) / senderCount);
        result.push({
          email: senderEmails[index],
          senderIndex,
          dayIndex,
          slotIndex,
          notBefore: new Date(slotBase + withinSlotOffset).toISOString(),
        });
      });
    });
  }
  return result.sort((left, right) => left.notBefore.localeCompare(right.notBefore));
}

export function summarizeFastCampaignSchedule(schedule: FastCampaignSlot[]) {
  const perDay = new Map<number, number>();
  const perSenderDay = new Map<string, number>();
  const perSlot = new Map<string, number>();
  for (const item of schedule) {
    perDay.set(item.dayIndex, (perDay.get(item.dayIndex) || 0) + 1);
    const senderDayKey = `${item.dayIndex}:${item.senderIndex}`;
    perSenderDay.set(senderDayKey, (perSenderDay.get(senderDayKey) || 0) + 1);
    const slotKey = `${item.dayIndex}:${item.slotIndex}`;
    perSlot.set(slotKey, (perSlot.get(slotKey) || 0) + 1);
  }
  return {
    total: schedule.length,
    dailyMaximum: Math.max(0, ...perDay.values()),
    senderDailyMaximum: Math.max(0, ...perSenderDay.values()),
    slotMaximum: Math.max(0, ...perSlot.values()),
  };
}
