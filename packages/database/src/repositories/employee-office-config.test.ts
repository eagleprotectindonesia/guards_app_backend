import {
  assertNoDuplicateOfficeJobTitles,
  parseOfficeJobTitleCategoryMap,
  resolveEmployeeFieldModeState,
  resolveOfficeJobTitleCategory,
} from './employee-office-config';

describe('employee office config helpers', () => {
  test('parses and normalizes office job title category map', () => {
    const result = parseOfficeJobTitleCategoryMap(
      '{"staff":[" Receptionist ","Receptionist"],"management":["Branch Manager"]}'
    );

    expect(result).toEqual({
      staff: ['Receptionist'],
      management: ['Branch Manager'],
    });
  });

  test('resolves office job title category by normalized exact match', () => {
    const category = resolveOfficeJobTitleCategory({
      role: 'office',
      jobTitle: '  branch manager ',
      categoryMap: {
        staff: ['Receptionist'],
        management: ['Branch Manager'],
      },
    });

    expect(category).toBe('management');
  });

  test('returns null category for non-office or unmapped titles', () => {
    expect(
      resolveOfficeJobTitleCategory({
        role: 'on_site',
        jobTitle: 'Receptionist',
        categoryMap: { staff: ['Receptionist'], management: [] },
      })
    ).toBeNull();

    expect(
      resolveOfficeJobTitleCategory({
        role: 'office',
        jobTitle: 'Unknown',
        categoryMap: { staff: ['Receptionist'], management: [] },
      })
    ).toBeNull();
  });

  test('rejects duplicate titles across categories', () => {
    expect(() =>
      assertNoDuplicateOfficeJobTitles({
        staff: ['Receptionist'],
        management: [' receptionIST '],
      })
    ).toThrow('assigned to both');
  });

  test('forces field mode true for office employees without office', () => {
    expect(
      resolveEmployeeFieldModeState({
        role: 'office',
        officeId: null,
        jobTitle: 'Receptionist',
        fieldModeEnabled: false,
        categoryMap: { staff: ['Receptionist'], management: [] },
      })
    ).toMatchObject({
      jobTitleCategory: 'staff',
      fieldModeEnabled: true,
      isFieldModeEditable: false,
      fieldModeReasonCode: 'missing_office',
    });
  });

  test('forces staff with office false and allows management with office to keep requested value', () => {
    expect(
      resolveEmployeeFieldModeState({
        role: 'office',
        officeId: 'office-1',
        jobTitle: 'Receptionist',
        fieldModeEnabled: true,
        categoryMap: { staff: ['Receptionist'], management: ['Branch Manager'] },
      })
    ).toMatchObject({
      jobTitleCategory: 'staff',
      fieldModeEnabled: false,
      isFieldModeEditable: false,
      fieldModeReasonCode: 'staff_with_office',
    });

    expect(
      resolveEmployeeFieldModeState({
        role: 'office',
        officeId: 'office-1',
        jobTitle: 'Branch Manager',
        fieldModeEnabled: true,
        categoryMap: { staff: ['Receptionist'], management: ['Branch Manager'] },
      })
    ).toMatchObject({
      jobTitleCategory: 'management',
      fieldModeEnabled: true,
      isFieldModeEditable: true,
      fieldModeReasonCode: 'management_with_office',
    });
  });
});
