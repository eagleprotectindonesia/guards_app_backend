# API Documentation: Get Attendances with Check-ins by Employee

## Endpoint

```
GET /api/external/v1/attendance/by-employee
```

## Description

Retrieves attendance records with their associated check-ins, grouped by shift, for a specific employee. Each attendance record includes the full shift details (site, shift type, dates) and an array of all check-ins performed during that shift.

## Authentication

This endpoint requires API key authentication via the external API system.

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employeeId` | string | **Yes** | The employee ID to filter attendance records |
| `startDate` | string (ISO 8601) | No | Filter shifts that start on or after this date |
| `endDate` | string (ISO 8601) | No | Filter shifts that start on or before this date |

### Notes on Date Filtering
- Date filters apply to the **shift start time** (`startsAt`), not the shift end time
- Dates should be in ISO 8601 format (e.g., `2026-02-15T00:00:00.000Z`)
- Both `startDate` and `endDate` are optional and can be used independently or together

## Response Format

### Success Response (200 OK)

```json
{
  "data": [
    {
      "attendance": {
        "id": "8c44a2f3-4ed6-4f89-a653-ae31e1844d43",
        "employeeId": "EMP001",
        "recordedAt": "2026-02-16T05:20:21.265Z",
        "status": "late",
        "metadata": {
          "location": {
            "lat": -8.6430162,
            "lng": 115.1977971
          },
          "latenessMins": 315
        },
        "shift": {
          "date": "2026-02-15T00:00:00.000Z",
          "startsAt": "2026-02-16T00:00:00.000Z",
          "endsAt": "2026-02-16T08:00:00.000Z",
          "status": "completed",
          "missedCount": 1,
          "site": {
            "name": "Headquarters",
            "clientName": "Headquarters Owner",
            "address": "Jl. Umalas 1 Gg. XXII, Kerobokan Kelod, Kec. Kuta Utara, Kabupaten Badung, Bali, Indonesia",
            "latitude": -8.6695866,
            "longitude": 115.1538065
          },
          "shiftType": {
            "name": "Morning Shift"
          }
        }
      },
      "checkins": [
        {
          "id": "9f5720de-d10c-4517-9e45-ddc980a952fa",
          "employeeId": "EMP001",
          "at": "2026-02-16T05:20:25.268Z",
          "source": "web-ui",
          "status": "late",
          "metadata": {
            "lat": -8.6430162,
            "lng": 115.1977971,
            "latenessMins": 16
          },
          "createdAt": "2026-02-16T05:20:25.278Z"
        }
      ]
    }
  ]
}
```

### Response Fields

#### Attendance Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique attendance record ID |
| `employeeId` | string | Employee identifier |
| `recordedAt` | string (ISO 8601) | Timestamp when attendance was recorded |
| `status` | string | Attendance status: `present`, `absent`, `late` |
| `metadata` | object | Additional metadata (location, lateness, etc.) |

#### Shift Object (nested in attendance)

| Field | Type | Description |
|-------|------|-------------|
| `date` | string (ISO 8601) | Shift date |
| `startsAt` | string (ISO 8601) | Shift start time |
| `endsAt` | string (ISO 8601) | Shift end time |
| `status` | string | Shift status: `scheduled`, `in_progress`, `completed`, `missed`, `cancelled` |
| `missedCount` | number | Number of missed check-ins during the shift |
| `site` | object | Site information (name, client, address, coordinates) |
| `shiftType` | object | Shift type information (name) |

#### Check-in Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique check-in ID |
| `employeeId` | string | Employee identifier |
| `at` | string (ISO 8601) | Check-in timestamp |
| `source` | string | Check-in source (e.g., `mobile`, `web-ui`, `api`) |
| `status` | string | Check-in status: `on_time`, `late` |
| `metadata` | object | Additional metadata (location, lateness, etc.) |
| `createdAt` | string (ISO 8601) | Record creation timestamp |

### Error Responses

#### 400 Bad Request - Missing Employee ID

```json
{
  "error": "employeeId is required"
}
```

#### 400 Bad Request - Invalid Date Format

```json
{
  "error": "Invalid startDate format. Use ISO 8601 format."
}
```

or

```json
{
  "error": "Invalid endDate format. Use ISO 8601 format."
}
```

#### 500 Internal Server Error

```json
{
  "error": "Internal Server Error"
}
```

## Example Requests

### Get all attendances for an employee

```bash
curl -X GET "https://api.example.com/api/external/v1/attendance/by-employee?employeeId=EMP001" \
  -H "X-API-Key: your-api-key"
```

### Get attendances within a date range

```bash
curl -X GET "https://api.example.com/api/external/v1/attendance/by-employee?employeeId=EMP001&startDate=2026-02-01T00:00:00.000Z&endDate=2026-02-28T23:59:59.999Z" \
  -H "X-API-Key: your-api-key"
```

### Get attendances from a specific date onwards

```bash
curl -X GET "https://api.example.com/api/external/v1/attendance/by-employee?employeeId=EMP001&startDate=2026-02-15T00:00:00.000Z" \
  -H "X-API-Key: your-api-key"
```

## Important Notes

1. **Employee Entity Excluded**: The employee entity is not included in the response to avoid redundancy, as the `employeeId` is already present in both attendance and check-in records.

2. **Grouping by Shift**: Each attendance record corresponds to one shift. All check-ins for that shift are included in the `checkins` array.

3. **Ordering**: 
   - Attendances are ordered by `recordedAt` in descending order (most recent first)
   - Check-ins within each attendance are ordered by `at` in ascending order (chronological)

4. **Empty Check-ins**: If a shift has an attendance record but no check-ins, the `checkins` array will be empty (`[]`).

5. **Date Filtering**: The date filters (`startDate` and `endDate`) apply to the shift's `startsAt` field, not the attendance's `recordedAt` field or the shift's `endsAt` field.
