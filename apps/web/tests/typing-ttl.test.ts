import { renderHook, act } from '@testing-library/react';
import { useAdminChat } from '@/hooks/use-admin-chat';
import { useSocket } from '@/components/socket-provider';

// Mock dependencies
jest.mock('@/components/socket-provider');
jest.mock('react-hot-toast');
jest.mock('@/lib/upload');
jest.mock('@/lib/image-utils');

describe('useAdminChat - Typing TTL', () => {
  let mockSocket: any;

  beforeEach(() => {
    jest.useFakeTimers();
    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (useSocket as jest.Mock).mockReturnValue({ socket: mockSocket, isConnected: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should clear typing status after 5 seconds of inactivity', () => {
    const { result } = renderHook(() => useAdminChat());

    // Get the typing listener
    const typingListener = mockSocket.on.mock.calls.find((call: any) => call[0] === 'typing')[1];

    // Simulate employee starts typing
    act(() => {
      typingListener({ employeeId: 'emp-123', isTyping: true });
    });

    expect(result.current.typingEmployees['emp-123']).toBe(true);

    // Fast-forward 5.1 seconds
    act(() => {
      jest.advanceTimersByTime(5100);
    });

    // Should be cleared
    expect(result.current.typingEmployees['emp-123']).toBeFalsy();
  });

  test('should NOT clear typing status if a new typing event is received within TTL', () => {
    const { result } = renderHook(() => useAdminChat());
    const typingListener = mockSocket.on.mock.calls.find((call: any) => call[0] === 'typing')[1];

    act(() => {
      typingListener({ employeeId: 'emp-123', isTyping: true });
    });

    // Advance 3 seconds
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.typingEmployees['emp-123']).toBe(true);

    // Simulate another typing event (refresh TTL)
    act(() => {
      typingListener({ employeeId: 'emp-123', isTyping: true });
    });

    // Advance another 3 seconds (total 6s since first event, but only 3s since second)
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    
    // Should STILL be typing
    expect(result.current.typingEmployees['emp-123']).toBe(true);

    // Advance 2.1 more seconds (total 5.1s since second event)
    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(result.current.typingEmployees['emp-123']).toBeFalsy();
  });
});
