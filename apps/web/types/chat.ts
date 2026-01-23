export interface Conversation {
  employeeId: string;
  employeeName: string;
  lastMessage: {
    content: string;
    sender: string;
    createdAt: string;
  };
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  employeeId: string;
  adminId?: string | null;
  sender: 'admin' | 'employee';
  content: string;
  attachments: string[];
  createdAt: string;
  readAt?: string | null;
}
