# E2E Testing Guide

This guide explains how to set up and run end-to-end tests for the EP Guard Scheduling application.

## Overview

The E2E test suite uses **Playwright** to test complete user flows across the application, including:
- Attendance recording and check-ins
- Chat functionality
- Real-time Socket.io events
- Background worker monitoring

## Prerequisites

1. **PostgreSQL**: Running instance for test database
2. **Redis**: Running instance for caching and pub/sub
3. **Node.js**: v20 or higher
4. **Application**: Web server and worker should be running

## Setup

### 1. Create Test Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create test database
CREATE DATABASE guards_app_test;

# Exit psql
\q
```

### 2. Configure Test Environment

Copy the example environment file:

```bash
cp .env.test.example .env.test
```

Edit `.env.test` with your test database credentials:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/guards_app_test"
REDIS_URL="redis://localhost:6379/1"
API_BASE_URL="http://localhost:3000"
JWT_SECRET="test-secret-key-for-e2e-testing"
```

### 3. Run Database Migrations

```bash
# Set environment to test
export DATABASE_URL="postgresql://postgres:password@localhost:5432/guards_app_test"

# Run Prisma migrations
cd packages/database
npx prisma db push
cd ../..
```

### 4. Start Application Services

The E2E tests require the web server and worker to be running:

```bash
# Terminal 1: Start web and worker
npm run dev
```

## Running Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test Suite

```bash
# Attendance tests only
npm run test:e2e tests/e2e/attendance/

# Chat tests only
npm run test:e2e tests/e2e/chat/

# Real-time tests only
npm run test:e2e tests/e2e/realtime/

# Specific test file
npm run test:e2e tests/e2e/attendance/initial-attendance.spec.ts
```

### Interactive UI Mode

```bash
npm run test:e2e:ui
```

This opens Playwright's UI mode where you can:
- See all tests
- Run tests individually
- Watch tests in real-time
- Debug failures

### Debug Mode

```bash
npm run test:e2e:debug
```

This runs tests with the Playwright Inspector for step-by-step debugging.

### View Test Report

After running tests, view the HTML report:

```bash
npm run test:e2e:report
```

## Test Structure

```
tests/e2e/
├── fixtures/           # Test data and setup
│   ├── database.ts    # Database utilities
│   ├── factories.ts   # Data factories
│   └── auth.ts        # Authentication helpers
├── helpers/           # Test utilities
│   ├── api-client.ts  # API request helpers
│   └── socket-client.ts # Socket.io helpers
├── attendance/        # Attendance & check-in tests
│   ├── initial-attendance.spec.ts
│   ├── recurring-checkins.spec.ts
│   ├── late-checkins.spec.ts
│   └── shift-completion.spec.ts
├── chat/             # Chat tests
│   └── messages.spec.ts
└── realtime/         # Socket.io tests
    └── socket-events.spec.ts
```

## Test Coverage

### Attendance & Check-in Tests

- ✅ Initial attendance recording (location validation)
- ✅ Recurring check-ins (on-time, early rejection)
- ✅ Late check-ins with bulk recording
- ✅ Auto-resolution of missed alerts
- ✅ Shift completion on last check-in

### Chat Tests

- ✅ Employee sending messages
- ✅ Admin sending messages
- ✅ Message attachments
- ✅ Conversation fetching
- ✅ Read receipts
- ✅ Unread message counts

### Real-time Tests

- ✅ Alert broadcasting to admin
- ✅ Active shifts streaming
- ✅ Dashboard backfill on connection
- ✅ Socket authentication

## Troubleshooting

### Tests Fail with Database Connection Error

**Problem**: `Can't reach database server`

**Solution**: Ensure PostgreSQL is running and DATABASE_URL in `.env.test` is correct.

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -U postgres -d guards_app_test
```

### Tests Fail with "Cannot connect to server"

**Problem**: Web server not running

**Solution**: Start the development server in a separate terminal:

```bash
npm run dev
```

### Socket.io Tests Timeout

**Problem**: Real-time tests timeout waiting for events

**Solution**: 
1. Ensure Redis is running
2. Check that worker is running (publishes events to Redis)
3. Verify REDIS_URL in `.env.test`

```bash
# Check Redis
redis-cli ping
# Should return: PONG
```

### Database Not Clean Between Tests

**Problem**: Tests fail due to existing data

**Solution**: Tests automatically clean the database before each run. If issues persist:

```bash
# Manually reset test database
export DATABASE_URL="postgresql://postgres:password@localhost:5432/guards_app_test"
cd packages/database
npx prisma db push --force-reset
cd ../..
```

## Best Practices

1. **Run tests frequently**: Catch issues early
2. **Use UI mode for debugging**: Visual feedback helps identify issues
3. **Keep test database separate**: Never use production or development database
4. **Clean data between tests**: Tests should be independent
5. **Use factories**: Create test data consistently

## CI/CD Integration (Future)

Currently, E2E tests are run manually. To integrate with CI/CD:

1. Add GitHub Actions workflow
2. Set up test database in CI environment
3. Run tests before deployment
4. Generate and archive test reports

## Learning Resources

These E2E tests demonstrate:
- **API Testing**: Using Playwright's APIRequestContext
- **Real-time Testing**: Testing Socket.io events
- **Database Management**: Setting up and cleaning test data
- **Authentication**: JWT token generation and usage
- **Test Fixtures**: Reusable test data factories

Explore the test files to learn these patterns!
