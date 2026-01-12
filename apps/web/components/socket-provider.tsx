'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, role }: { children: React.ReactNode; role?: 'admin' | 'guard' }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // In Next.js, we can use a relative URL or the same host
    const socketInstance = io({
      path: '/socket.io', // Default path
      reconnectionAttempts: 5,
      auth: {
        role,
      },
    });

    socketInstance.on('connect', () => {
      console.log(`Socket connected for role: ${role || 'default'}`);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log(`Socket disconnected for role: ${role || 'default'}`);
      setIsConnected(false);
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [role]);

  return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
};
