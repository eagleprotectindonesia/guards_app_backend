'use client';

import { useState, useEffect } from 'react';

export default function GuardPage() {
  const [guardId, setGuardId] = useState('');
  const [activeShift, setActiveShift] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [nextDue, setNextDue] = useState<Date | null>(null);

  const fetchShift = async () => {
    if (!guardId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/my/active-shift', {
        headers: { 'x-mock-guard-id': guardId },
      });
      const data = await res.json();
      if (data.activeShift) {
        setActiveShift(data.activeShift);
        // Calculate next due
        const last = data.activeShift.lastHeartbeatAt || data.activeShift.startsAt;
        const interval = data.activeShift.requiredCheckinIntervalMins * 60000;
        setNextDue(new Date(new Date(last).getTime() + interval));
      } else {
        setActiveShift(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!activeShift) return;
    setStatus('Checking in...');
    try {
      const res = await fetch(`/api/shifts/${activeShift.id}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mock-guard-id': guardId,
        },
        body: JSON.stringify({ source: 'web-ui' }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus(`Error: ${data.error}`);
      } else {
        setStatus(`Checked in! Status: ${data.status}`);
        setNextDue(new Date(data.next_due_at));
        fetchShift(); // Refresh
      }
    } catch (err) {
      setStatus('Network Error');
    }
  };

  return (
    <div className="p-8 max-w-md mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-4">Guard Interface</h1>
      
      <div className="mb-6 p-4 border rounded bg-gray-50">
        <label className="block text-sm font-medium mb-1">Simulate Login (Guard ID)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={guardId}
            onChange={(e) => setGuardId(e.target.value)}
            className="border p-2 flex-1 rounded"
            placeholder="UUID..."
          />
          <button onClick={fetchShift} className="bg-blue-600 text-white px-4 py-2 rounded">
            Login
          </button>
        </div>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && guardId && !activeShift && (
        <div className="text-center p-8 border-2 border-dashed rounded">
          <p className="text-gray-500">No active shift found for this guard.</p>
        </div>
      )}

      {activeShift && (
        <div className="border rounded-lg shadow-sm p-6 bg-white">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{activeShift.shiftType.name}</h2>
            <p className="text-gray-600">{activeShift.site.name}</p>
          </div>
          
          <div className="mb-6">
            <p className="text-sm text-gray-500">Next Check-in Due:</p>
            <p className="text-3xl font-mono font-bold text-blue-600">
              {nextDue ? nextDue.toLocaleTimeString() : '--:--'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Grace period: {activeShift.graceMinutes} min
            </p>
          </div>

          <button
            onClick={handleCheckIn}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-lg font-bold py-4 rounded-lg shadow transition-all active:scale-95"
          >
            CHECK IN NOW
          </button>

          {status && <p className="mt-4 text-center font-medium">{status}</p>}
        </div>
      )}
    </div>
  );
}
