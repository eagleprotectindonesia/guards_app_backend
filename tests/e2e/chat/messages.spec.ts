import { test, expect } from '../helpers/api-client';
import { setupTestDatabase, cleanDatabase, getTestPrisma } from '../fixtures/database';
import { createCompleteTestSetup, createAdmin } from '../fixtures/factories';
import { makeEmployeeRequest, makeAdminRequest } from '../helpers/api-client';
import type { Employee, Admin } from '@repo/database';

test.describe('Chat - Send and Receive Messages', () => {
  let employee: Employee;
  let admin: Admin;

  test.beforeAll(async () => {
    await setupTestDatabase();
  });

  test.beforeEach(async () => {
    await cleanDatabase();
    
    const setup = await createCompleteTestSetup();
    employee = setup.employee;
    admin = setup.admin;
  });

  test('employee should send message to admin', async ({ request }) => {
    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/shared/chat/${employee.id}`,
      {
        data: {
          content: 'Hello, I have a question about my shift',
        },
      }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.message).toBeDefined();
    expect(data.message.content).toBe('Hello, I have a question about my shift');
    expect(data.message.sender).toBe('employee');
    expect(data.message.employeeId).toBe(employee.id);

    // Verify in database
    const prisma = getTestPrisma();
    const message = await prisma.chatMessage.findFirst({
      where: {
        employeeId: employee.id,
        sender: 'employee',
      },
    });
    
    expect(message).not.toBeNull();
    expect(message?.content).toBe('Hello, I have a question about my shift');
    expect(message?.readAt).toBeNull(); // Not read yet
  });

  test('admin should send message to employee', async ({ request }) => {
    const response = await makeAdminRequest(
      request,
      admin,
      'POST',
      `/api/shared/chat/${employee.id}`,
      {
        data: {
          content: 'Hi, how can I help you?',
        },
      }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.message).toBeDefined();
    expect(data.message.content).toBe('Hi, how can I help you?');
    expect(data.message.sender).toBe('admin');
    expect(data.message.adminId).toBe(admin.id);

    // Verify in database
    const prisma = getTestPrisma();
    const message = await prisma.chatMessage.findFirst({
      where: {
        employeeId: employee.id,
        sender: 'admin',
        adminId: admin.id,
      },
    });
    
    expect(message).not.toBeNull();
  });

  test('should send message with attachments', async ({ request }) => {
    const attachments = [
      'https://example.com/image1.jpg',
      'https://example.com/document.pdf',
    ];

    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/shared/chat/${employee.id}`,
      {
        data: {
          content: 'Here are the documents you requested',
          attachments,
        },
      }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.message.attachments).toEqual(attachments);

    // Verify in database
    const prisma = getTestPrisma();
    const message = await prisma.chatMessage.findFirst({
      where: {
        employeeId: employee.id,
        sender: 'employee',
      },
    });
    
    expect(message?.attachments).toHaveLength(2);
    expect(message?.attachments).toContain('https://example.com/image1.jpg');
  });

  test('should fetch conversation messages', async ({ request }) => {
    const prisma = getTestPrisma();
    
    // Create some messages
    await prisma.chatMessage.createMany({
      data: [
        {
          employeeId: employee.id,
          sender: 'employee',
          content: 'Message 1',
        },
        {
          employeeId: employee.id,
          adminId: admin.id,
          sender: 'admin',
          content: 'Message 2',
        },
        {
          employeeId: employee.id,
          sender: 'employee',
          content: 'Message 3',
        },
      ],
    });

    const response = await makeEmployeeRequest(
      request,
      employee,
      'GET',
      `/api/shared/chat/${employee.id}`,
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.messages).toBeDefined();
    expect(data.messages.length).toBe(3);
    
    // Messages should be in chronological order
    expect(data.messages[0].content).toBe('Message 1');
    expect(data.messages[1].content).toBe('Message 2');
    expect(data.messages[2].content).toBe('Message 3');
  });

  test('should mark messages as read when fetched by recipient', async ({ request }) => {
    const prisma = getTestPrisma();
    
    // Admin sends message to employee
    const message = await prisma.chatMessage.create({
      data: {
        employeeId: employee.id,
        adminId: admin.id,
        sender: 'admin',
        content: 'Unread message',
      },
    });

    expect(message.readAt).toBeNull();

    // Employee fetches messages
    const response = await makeEmployeeRequest(
      request,
      employee,
      'GET',
      `/api/shared/chat/${employee.id}`,
    );

    expect(response.status()).toBe(200);

    // Verify message marked as read
    const updatedMessage = await prisma.chatMessage.findUnique({
      where: { id: message.id },
    });
    
    expect(updatedMessage?.readAt).not.toBeNull();
  });

  test('should get unread message count', async ({ request }) => {
    const prisma = getTestPrisma();
    
    // Create unread messages from admin to employee
    await prisma.chatMessage.createMany({
      data: [
        {
          employeeId: employee.id,
          adminId: admin.id,
          sender: 'admin',
          content: 'Unread 1',
        },
        {
          employeeId: employee.id,
          adminId: admin.id,
          sender: 'admin',
          content: 'Unread 2',
        },
        {
          employeeId: employee.id,
          sender: 'employee',
          content: 'My message',
          readAt: new Date(), // Already read
        },
      ],
    });

    const response = await makeEmployeeRequest(
      request,
      employee,
      'GET',
      `/api/shared/chat/unread`,
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.unreadCount).toBe(2);
  });

  test('should get conversation list with latest message', async ({ request }) => {
    const prisma = getTestPrisma();
    
    // Create messages
    await prisma.chatMessage.create({
      data: {
        employeeId: employee.id,
        sender: 'employee',
        content: 'Latest message',
      },
    });

    const response = await makeAdminRequest(
      request,
      admin,
      'GET',
      `/api/shared/chat/conversations`,
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.conversations).toBeDefined();
    expect(data.conversations.length).toBeGreaterThan(0);
    
    const conversation = data.conversations.find(
      (c: any) => c.employeeId === employee.id
    );
    
    expect(conversation).toBeDefined();
    expect(conversation.lastMessage.content).toBe('Latest message');
  });
});
