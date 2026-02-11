import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from './redis';
import { prisma } from './prisma';
import { authenticateSocket } from './socket-auth';
import { saveMessage, markAsRead } from './data-access/chat';
import '../types/socket';
import { ChatMessage } from '../types/chat';
import { Shift, Site } from '@repo/types';

/**
 * Initializes the Socket.io server with Redis adapter and unified handlers.
 */
export function initSocket(server: HttpServer | HttpsServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // 1. Redis Adapter Setup
  const pubClient = redis.duplicate({ enableOfflineQueue: true });
  const subClient = redis.duplicate({ enableOfflineQueue: true });
  io.adapter(createAdapter(pubClient, subClient));

  // 2. System-wide Redis Subscribers (Alerts, Dashboard)
  setupSystemSubscribers(io);

  // 3. Auth Middleware
  io.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket.handshake);
      if (auth) {
        socket.auth = auth;
        next();
      } else {
        next(new Error('Unauthorized'));
      }
    } catch (error) {
      console.error('Socket Auth Error:', error);
      next(new Error('Internal Server Error'));
    }
  });

  // 4. Connection Handler
  io.on('connection', socket => {
    const auth = socket.auth!;
    console.log(`Socket connected: ${auth.type} ${auth.id}`);

    if (auth.type === 'admin') {
      handleAdminSocket(io, socket);
    } else {
      handleEmployeeSocket(io, socket);
    }

    handleChatEvents(io, socket);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${auth.type} ${auth.id}`);
    });
  });

  return io;
}

/**
 * Listens to Redis channels and broadcasts to Socket.io rooms.
 */
async function setupSystemSubscribers(io: SocketIOServer) {
  const sub = redis.duplicate({ enableOfflineQueue: true });

  sub.on('error', err => {
    console.error('[Socket Redis Sub] Error:', err);
  });

  const handleRedisMessage = (channel: string, message: string) => {
    try {
      const payload = JSON.parse(message);

      if (channel.startsWith('alerts:site:')) {
        const siteId = channel.split(':').pop();
        // Broadcast to global admin room
        io.to('admin').emit('alert', payload);
        // Broadcast to site-specific admin room
        if (siteId) {
          io.to(`admin:site:${siteId}`).emit('alert', payload);
        }
      } else if (channel === 'dashboard:active-shifts') {
        io.to('admin').emit('active_shifts', payload);
      } else if (channel === 'dashboard:upcoming-shifts') {
        io.to('admin').emit('upcoming_shifts', payload);
      }
    } catch (err) {
      console.error('[Socket Redis Sub] Parse Error:', err, 'Message:', message);
    }
  };

  sub.on('message', (channel, message) => {
    handleRedisMessage(channel, message);
  });

  sub.on('pmessage', (_pattern, channel, message) => {
    handleRedisMessage(channel, message);
  });

  try {
    await sub.psubscribe('alerts:site:*');
    await sub.subscribe('dashboard:active-shifts', 'dashboard:upcoming-shifts');
    console.log('[Socket Redis Sub] Subscribed to alerts and dashboard channels');
  } catch (err) {
    console.error('[Socket Redis Sub] Subscription Failed:', err);
  }
}

/**
 * Handlers for Administrative users.
 */
function handleAdminSocket(io: SocketIOServer, socket: Socket) {
  socket.join('admin');

  socket.on('subscribe_site', (siteId: string) => {
    socket.rooms.forEach(r => {
      if (r.startsWith('admin:site:')) socket.leave(r);
    });
    socket.join(`admin:site:${siteId}`);
  });

  socket.on('request_dashboard_backfill', async (data: { siteId?: string }) => {
    try {
      const { siteId } = data;

      // Fetch Alerts
      const alerts = await prisma.alert.findMany({
        where: { resolvedAt: null, ...(siteId ? { siteId } : {}) },
        orderBy: { createdAt: 'desc' },
        include: { site: true, shift: { include: { employee: true, shiftType: true } } },
      });

      // Fetch Warnings from Redis
      const warningPattern = siteId ? `alert:warning:${siteId}:*` : `alert:warning:*`;
      const warningKeys = await redis.keys(warningPattern);
      const warnings =
        warningKeys.length > 0
          ? (await redis.mget(...warningKeys)).filter((v): v is string => v !== null).map(v => JSON.parse(v))
          : [];

      socket.emit('dashboard:backfill', {
        alerts: [...alerts, ...warnings].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });

      // Global Stats
      if (!siteId) {
        const now = new Date();
        const activeShifts = await prisma.shift.findMany({
          where: {
            status: { in: ['scheduled', 'in_progress'] },
            startsAt: { lte: now },
            endsAt: { gte: now },
            employeeId: { not: null },
          },
          include: { shiftType: true, employee: true, site: true, attendance: true },
        });

        // Group by site to match SSE format
        const activeSitesMap = new Map<string, { site: Site; shifts: Shift[] }>();
        for (const shift of activeShifts) {
          if (!activeSitesMap.has(shift.siteId)) {
            activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
          }
          activeSitesMap.get(shift.siteId)?.shifts.push(shift);
        }

        const upcoming = await prisma.shift.findMany({
          where: { status: 'scheduled', startsAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600000) } },
          include: { shiftType: true, employee: true, site: true },
          orderBy: { startsAt: 'asc' },
          take: 50,
        });
        socket.emit('active_shifts', Array.from(activeSitesMap.values()));
        socket.emit('upcoming_shifts', upcoming);
      }
    } catch (err) {
      console.error('Backfill Error:', err);
    }
  });
}

/**
 * Handlers for Employee users (Guards).
 */
async function handleEmployeeSocket(io: SocketIOServer, socket: Socket) {
  const auth = socket.auth!;

  // Join employee room - session revocation is handled via Redis stream polling below
  socket.join(`employee:${auth.id}`);

  // Listen to Redis Stream for session/shift updates
  const sub = redis.duplicate({
    enableOfflineQueue: true,
    commandTimeout: 15000, // Must be higher than the BLOCK timeout (10000ms)
  });
  let active = true;

  const poll = async () => {
    let lastId = '$';
    while (active) {
      try {
        const res = await sub.xread('BLOCK', 10000, 'STREAMS', `employee:stream:${auth.id}`, lastId);
        if (res?.[0]) {
          for (const [id, fields] of res[0][1]) {
            lastId = id;
            const data: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];

            if (data.type === 'session_revoked' && parseInt(data.newTokenVersion, 10) > (auth.tokenVersion || 0)) {
              const newClientType = data.clientType || 'unknown';
              const currentClientType = auth.clientType || 'unknown';
              
              // Only force logout if the new login is from a DIFFERENT client type
              if (newClientType !== currentClientType) {
                socket.emit('auth:force_logout', { reason: 'logged_in_elsewhere' });
                socket.disconnect(true);
                active = false;
              }
            } else if (data.type === 'shift_updated') {
              socket.emit('shift:updated', { shiftId: data.shiftId });
            }
          }
        }
      } catch (err) {
        console.error(`Error polling employee stream (${auth.id}):`, err);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    sub.quit();
  };

  poll();
  socket.on('disconnect', () => {
    active = false;
  });
}

interface ChatMessageData {
  content: string;
  employeeId?: string;
  guardId?: string;
  attachments?: string[];
}

interface MarkReadData {
  messageIds: string[];
  employeeId?: string;
  guardId?: string;
}

interface TypingData {
  isTyping: boolean;
  employeeId?: string;
  guardId?: string;
}

/**
 * Handlers for Chat functionality.
 */
function handleChatEvents(io: SocketIOServer, socket: Socket) {
  const auth = socket.auth!;

  socket.on('send_message', async (data: ChatMessageData) => {
    try {
      const targetId = data.employeeId || data.guardId;
      if (data.attachments && data.attachments.length > 4) {
        return socket.emit('error', { message: 'Max 4 attachments' });
      }

      if (auth.type === 'employee') {
        const msg = (await saveMessage({
          employeeId: auth.id,
          sender: 'employee',
          content: data.content,
          attachments: data.attachments,
        })) as unknown as ChatMessage;
        io.to('admin').to(`employee:${auth.id}`).emit('new_message', msg);
      } else if (auth.type === 'admin' && targetId) {
        const lockKey = `chat_lock:${targetId}`;
        const lockedBy = await redis.get(lockKey);
        if (lockedBy && lockedBy !== auth.id) return socket.emit('error', { message: 'Locked by another admin' });

        await redis.set(lockKey, auth.id, 'EX', 120);
        io.to('admin').emit('conversation_locked', {
          employeeId: targetId,
          lockedBy: auth.id,
          expiresAt: Date.now() + 120000,
        });

        const msg = (await saveMessage({
          employeeId: targetId,
          adminId: auth.id,
          sender: 'admin',
          content: data.content,
          attachments: data.attachments,
        })) as unknown as ChatMessage;
        io.to(`employee:${targetId}`).to('admin').emit('new_message', msg);
      }
    } catch (err) {
      console.error('Send Message Error:', err);
      socket.emit('error', { message: 'Failed to send' });
    }
  });

  socket.on('mark_read', async (data: MarkReadData) => {
    const targetId = auth.type === 'admin' ? data.employeeId || data.guardId : auth.id;
    if (!targetId) return;
    await markAsRead(data.messageIds);
    const payload = {
      messageIds: data.messageIds,
      employeeId: targetId,
      readBy: auth.type === 'admin' ? auth.id : undefined,
    };
    io.to('admin').to(`employee:${targetId}`).emit('messages_read', payload);
  });

  socket.on('typing', (data: TypingData) => {
    const targetId = data.employeeId || data.guardId;
    const payload = { employeeId: auth.type === 'employee' ? auth.id : targetId, isTyping: data.isTyping };
    if (auth.type === 'employee') io.to('admin').emit('typing', payload);
    else if (targetId) io.to(`employee:${targetId}`).emit('typing', payload);
  });
}
