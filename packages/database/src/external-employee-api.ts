export interface ExternalEmployee {
  id: string;
  employee_number: string;
  personnel_id: string | null;
  nickname: string | null;
  full_name: string;
  job_title: string | null;
  department: string | null;
  office_id: string | null;
  office_name: string | null;
}

const EXTERNAL_EMPLOYEE_ADDRESS = process.env.EXTERNAL_EMPLOYEE_ADDRESS;
const EXTERNAL_EMPLOYEE_API_KEY = process.env.EXTERNAL_EMPLOYEE_API_KEY;

export async function fetchExternalEmployees(): Promise<ExternalEmployee[]> {
  if (!EXTERNAL_EMPLOYEE_ADDRESS || !EXTERNAL_EMPLOYEE_API_KEY) {
    throw new Error('EXTERNAL_EMPLOYEE_ADDRESS or EXTERNAL_EMPLOYEE_API_KEY not configured');
  }

  try {
    const response = await fetch(EXTERNAL_EMPLOYEE_ADDRESS, {
      headers: {
        'x-internal-api-key': EXTERNAL_EMPLOYEE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch external employees: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching external employees:', error);
    throw error;
  }
}
