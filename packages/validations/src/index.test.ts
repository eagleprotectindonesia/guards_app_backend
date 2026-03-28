import { updateDefaultOfficeWorkScheduleSchema, updateOfficeWorkScheduleSchema } from './index';

const overnightDays = [
  { weekday: 0, isWorkingDay: false, startTime: null, endTime: null },
  { weekday: 1, isWorkingDay: true, startTime: '18:00', endTime: '02:00' },
  { weekday: 2, isWorkingDay: false, startTime: null, endTime: null },
  { weekday: 3, isWorkingDay: false, startTime: null, endTime: null },
  { weekday: 4, isWorkingDay: false, startTime: null, endTime: null },
  { weekday: 5, isWorkingDay: false, startTime: null, endTime: null },
  { weekday: 6, isWorkingDay: false, startTime: null, endTime: null },
];

describe('office work schedule validation', () => {
  test('allows overnight working hours that end the next day', () => {
    expect(
      updateOfficeWorkScheduleSchema.safeParse({
        name: 'Night Shift Schedule',
        days: overnightDays,
      }).success
    ).toBe(true);

    expect(
      updateDefaultOfficeWorkScheduleSchema.safeParse({
        days: overnightDays,
      }).success
    ).toBe(true);
  });

  test('rejects zero-length working hours', () => {
    const result = updateOfficeWorkScheduleSchema.safeParse({
      name: 'Broken Schedule',
      days: [
        { weekday: 0, isWorkingDay: false, startTime: null, endTime: null },
        { weekday: 1, isWorkingDay: true, startTime: '18:00', endTime: '18:00' },
        { weekday: 2, isWorkingDay: false, startTime: null, endTime: null },
        { weekday: 3, isWorkingDay: false, startTime: null, endTime: null },
        { weekday: 4, isWorkingDay: false, startTime: null, endTime: null },
        { weekday: 5, isWorkingDay: false, startTime: null, endTime: null },
        { weekday: 6, isWorkingDay: false, startTime: null, endTime: null },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('End time must be different from start time');
    }
  });
});
