import { addDays, parse } from 'date-fns';

const STANDARD_TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidShiftTypeTime(value: string) {
  return value === '24:00' || STANDARD_TIME_PATTERN.test(value);
}

export function getShiftTypeTimeMinutes(value: string) {
  if (value === '24:00') {
    return 24 * 60;
  }

  const [hourText, minuteText] = value.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

export function parseShiftTypeTimeOnDate(date: string, value: string) {
  if (!isValidShiftTypeTime(value)) {
    throw new Error(`Invalid shift type time: ${value}`);
  }

  if (value === '24:00') {
    const midnight = parse(`${date} 00:00`, 'yyyy-MM-dd HH:mm', new Date());
    return addDays(midnight, 1);
  }

  return parse(`${date} ${value}`, 'yyyy-MM-dd HH:mm', new Date());
}
