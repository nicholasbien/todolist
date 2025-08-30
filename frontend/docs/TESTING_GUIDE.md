# MCP Integration Testing Guide

## Overview

This guide provides comprehensive testing procedures for the MCP (Model Context Protocol) integrated todo application, covering unit tests, integration tests, and manual testing procedures.

## Test Architecture

### Testing Stack
- **Unit Testing**: Jest with Testing Library
- **Integration Testing**: Custom MCP protocol testing
- **E2E Testing**: Manual testing procedures
- **Mocking**: MockedFunction for external dependencies
- **Coverage**: Istanbul/NYC for code coverage reporting

### Test Structure
```
frontend/__tests__/
├── agent.test.ts              # Agent logic and tool selection
├── AgentIntegration.test.ts   # End-to-end integration tests
├── McpHub.test.ts            # MCP hub functionality
├── MemoryServer.test.ts      # Memory server tool tests
├── OpenAILlm.test.ts         # LLM streaming tests
├── WeatherServer.test.ts     # Weather server tool tests
└── AppMain.test.tsx          # Frontend component tests
```

## Automated Test Suite

### Running Tests

**Development Testing:**
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- agent.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="weather"
```

**CI/CD Testing:**
```bash
# Production test run
npm run test:ci

# Generate coverage report
npm run test:coverage -- --coverageReporters=text-lcov | coveralls
```

### Test Configuration

**Jest Configuration (jest.config.js):**
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/__tests__/$1'
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/out/'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'pages/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  }
};
```

## Unit Tests

### 1. Agent Tests (`__tests__/agent.test.ts`)

**Test Coverage:**
- Tool selection logic
- System prompt generation
- Message streaming
- Error handling
- Tool call validation

**Key Test Cases:**
```typescript
describe('Agent', () => {
  test('selects correct weather tool for weather queries', async () => {
    // Test weather-related queries trigger weather.current tool
  });

  test('selects correct memory tool for task operations', async () => {
    // Test task-related queries trigger mem.task.add tool
  });

  test('handles tool call errors gracefully', async () => {
    // Test error propagation and user-friendly error messages
  });

  test('streams responses incrementally', async () => {
    // Test streaming response generation
  });
});
```

### 2. MCP Hub Tests (`__tests__/McpHub.test.ts`)

**Test Coverage:**
- Server registration and connection
- Tool discovery and listing
- Tool call routing
- Connection management
- Error handling

**Key Test Cases:**
```typescript
describe('McpHub', () => {
  test('successfully connects to MCP servers', async () => {
    // Test stdio client transport initialization
  });

  test('lists tools from connected servers', async () => {
    // Test tool catalog aggregation from multiple servers
  });

  test('routes tool calls to correct server', async () => {
    // Test namespace resolution (weather.* vs mem.*)
  });

  test('handles server connection failures', async () => {
    // Test graceful degradation when servers unavailable
  });
});
```

### 3. Memory Server Tests (`__tests__/MemoryServer.test.ts`)

**Test Coverage:**
- All 5 memory tools (add, update, list, journal, search)
- Backend API integration
- Authentication handling
- Space-aware operations
- Error scenarios

**Key Test Cases:**
```typescript
describe('MemoryServer', () => {
  describe('mem.task.add', () => {
    test('creates task with valid input', async () => {
      // Test task creation with proper backend API call
    });

    test('validates required fields', async () => {
      // Test Zod schema validation
    });

    test('handles backend API errors', async () => {
      // Test error propagation from backend failures
    });
  });

  describe('mem.task.list', () => {
    test('returns filtered task list', async () => {
      // Test task filtering by completion status
    });

    test('respects space isolation', async () => {
      // Test space-aware data access
    });
  });

  // Additional tests for update, journal, search tools...
});
```

### 4. Weather Server Tests (`__tests__/WeatherServer.test.ts`)

**Test Coverage:**
- All 3 weather tools (current, forecast, alerts)
- Mock data generation
- Unit conversion
- Input validation
- Error handling

**Key Test Cases:**
```typescript
describe('WeatherServer', () => {
  describe('weather.current', () => {
    test('returns weather for known cities', async () => {
      // Test mock data retrieval for predefined cities
    });

    test('generates random data for unknown cities', async () => {
      // Test fallback data generation
    });

    test('converts temperature units correctly', async () => {
      // Test metric/imperial/kelvin conversion
    });
  });

  describe('weather.forecast', () => {
    test('generates multi-day forecast', async () => {
      // Test forecast generation with variable days
    });

    test('respects day limits (1-5)', async () => {
      // Test input validation and bounds checking
    });
  });
});
```

### 5. OpenAI LLM Tests (`__tests__/OpenAILlm.test.ts`)

**Test Coverage:**
- Streaming response handling
- Tool call parsing
- Delta chunk reassembly
- Error recovery
- JSON Schema conversion

**Key Test Cases:**
```typescript
describe('OpenAILlm', () => {
  test('streams text responses correctly', async () => {
    // Test incremental text response streaming
  });

  test('reassembles tool call deltas', async () => {
    // Test tool call chunk accumulation and parsing
  });

  test('converts tool schemas to OpenAI format', async () => {
    // Test MCP schema to JSON Schema conversion
  });

  test('handles partial tool calls', async () => {
    // Test incomplete JSON handling during streaming
  });
});
```

### 6. Integration Tests (`__tests__/AgentIntegration.test.ts`)

**Test Coverage:**
- End-to-end agent workflows
- Multi-tool operations
- Authentication flow
- Error recovery scenarios
- Performance characteristics

**Key Test Cases:**
```typescript
describe('Agent Integration', () => {
  test('completes full weather query workflow', async () => {
    // Test: user query → tool selection → API call → response
  });

  test('completes full task management workflow', async () => {
    // Test: task creation → listing → completion → verification
  });

  test('handles authentication across tool calls', async () => {
    // Test JWT token propagation to MCP servers
  });

  test('recovers from transient failures', async () => {
    // Test retry logic and error handling
  });
});
```

## Manual Testing Procedures

### 1. Development Environment Testing

**Setup Prerequisites:**
```bash
# Start backend server
cd backend && source venv/bin/activate && uvicorn app:app --port 8000

# Start frontend server
cd frontend && PORT=3000 npm run dev

# Verify environment
curl http://localhost:8000/health
curl http://localhost:3000/api/agent/stream?q=hello
```

### 2. MCP Tool Testing

#### Weather Tools Testing

**Test Cases:**
```bash
# Test current weather (known city)
curl -s "http://localhost:3000/api/agent/stream?q=what%27s%20the%20weather%20in%20tokyo" | grep -E "event:|data:"

# Test current weather (unknown city)
curl -s "http://localhost:3000/api/agent/stream?q=weather%20in%20atlantis" | grep -E "event:|data:"

# Test weather forecast
curl -s "http://localhost:3000/api/agent/stream?q=weather%20forecast%20for%20london%20for%203%20days" | grep -E "event:|data:"

# Test weather alerts
curl -s "http://localhost:3000/api/agent/stream?q=any%20weather%20alerts%20for%20new%20york" | grep -E "event:|data:"
```

**Expected Results:**
- Weather queries should trigger appropriate weather tools
- Responses should include temperature, description, humidity, wind speed
- Unit conversion should work (metric/imperial/kelvin)
- Unknown cities should generate realistic random data

#### Memory Tools Testing

**Test Cases:**
```bash
# Test task creation
curl -s "http://localhost:3000/api/agent/stream?q=add%20task%20buy%20groceries%20with%20high%20priority" | grep -E "event:|data:"

# Test task listing
curl -s "http://localhost:3000/api/agent/stream?q=show%20me%20my%20tasks" | grep -E "event:|data:"

# Test task completion
curl -s "http://localhost:3000/api/agent/stream?q=mark%20task%20X%20as%20completed" | grep -E "event:|data:"

# Test journal entry
curl -s "http://localhost:3000/api/agent/stream?q=add%20journal%20entry%20today%20was%20productive" | grep -E "event:|data:"

# Test search
curl -s "http://localhost:3000/api/agent/stream?q=search%20for%20grocery%20tasks" | grep -E "event:|data:"
```

**Expected Results:**
- Task operations should integrate with backend database
- Proper authentication should be maintained
- Space isolation should be respected
- Search should return relevant results

### 3. Frontend Integration Testing

#### Browser Testing

**Manual Test Procedures:**

1. **Chat Interface Testing:**
   - Open browser to `http://localhost:3000`
   - Test chat input and submission
   - Verify streaming responses appear correctly
   - Test tool call result display
   - Verify error message display

2. **Weather Query Testing:**
   ```
   User Input: "What's the weather in Paris?"
   Expected: Weather tool call → Temperature, description, humidity display

   User Input: "Give me a 5-day forecast for Seattle"
   Expected: Forecast tool call → Multi-day weather data display

   User Input: "Any weather warnings for Miami?"
   Expected: Alerts tool call → Alert status display
   ```

3. **Task Management Testing:**
   ```
   User Input: "Add a task to call dentist with high priority"
   Expected: Task creation → Backend API call → Confirmation message

   User Input: "Show me all my incomplete tasks"
   Expected: Task listing → Database query → Task display

   User Input: "Mark the dentist task as done"
   Expected: Task update → Backend API call → Status update
   ```

4. **Error Handling Testing:**
   ```
   Test Scenario: Disconnect backend server
   User Input: "Add task test"
   Expected: Graceful error message, no crash

   Test Scenario: Invalid OpenAI API key
   User Input: "What's the weather?"
   Expected: API error message, retry option
   ```

### 4. Authentication & Security Testing

**Test Procedures:**

1. **Token Validation:**
   - Test requests with valid JWT tokens
   - Test requests with expired tokens
   - Test requests with malformed tokens
   - Verify proper error responses

2. **Space Isolation:**
   - Create tasks in different spaces
   - Verify task isolation between spaces
   - Test space member access controls
   - Verify journal entry space separation

3. **Input Validation:**
   - Test malicious input strings
   - Test SQL injection attempts
   - Test XSS payload inputs
   - Verify all inputs are properly sanitized

### 5. Performance Testing

**Load Testing Procedures:**

1. **Concurrent User Testing:**
   ```bash
   # Install artillery for load testing
   npm install -g artillery

   # Create load test configuration
   cat > load-test.yml << EOF
   config:
     target: 'http://localhost:3000'
     phases:
       - duration: 60
         arrivalRate: 5
   scenarios:
     - name: "Weather queries"
       requests:
         - get:
             url: "/api/agent/stream?q=weather%20in%20tokyo"
     - name: "Task operations"
       requests:
         - get:
             url: "/api/agent/stream?q=add%20task%20test"
   EOF

   # Run load test
   artillery run load-test.yml
   ```

2. **Memory Usage Monitoring:**
   ```bash
   # Monitor Node.js memory usage
   ps aux | grep node

   # Monitor system resources
   htop

   # Check for memory leaks
   node --inspect --expose-gc your-app.js
   ```

3. **Response Time Testing:**
   - Measure API response times under various loads
   - Test streaming response latency
   - Monitor MCP server startup overhead
   - Verify database query performance

## Test Data Management

### 1. Test Database Setup

**MongoDB Test Database:**
```javascript
// test/setup.js
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URL = uri;
});

afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});
```

### 2. Mock Data Creation

**Test Data Fixtures:**
```typescript
// test/fixtures/testData.ts
export const mockTasks = [
  {
    _id: '507f1f77bcf86cd799439011',
    text: 'Buy groceries',
    category: 'Personal',
    priority: 'high',
    completed: false,
    space_id: 'space123',
    dateAdded: new Date().toISOString()
  },
  // ... more test data
];

export const mockWeatherData = {
  'tokyo': {
    location: 'Tokyo, Japan',
    temperature: 25,
    description: 'Clear sky',
    humidity: 60,
    windSpeed: 8
  }
};
```

### 3. Mock Service Responses

**API Mocking:**
```typescript
// test/mocks/apiMocks.ts
import fetchMock from 'jest-fetch-mock';

beforeEach(() => {
  fetchMock.resetMocks();
});

export const mockSuccessfulTaskCreation = () => {
  fetchMock.mockResponseOnce(JSON.stringify({
    _id: '507f1f77bcf86cd799439011',
    text: 'Test task',
    completed: false
  }));
};

export const mockOpenAIResponse = () => {
  fetchMock.mockResponseOnce(JSON.stringify({
    choices: [{
      delta: { content: 'Test response' }
    }]
  }));
};
```

## Continuous Integration

### GitHub Actions Configuration

**.github/workflows/test.yml:**
```yaml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    services:
      mongodb:
        image: mongo:5.0
        ports:
          - 27017:27017

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
        cache-dependency-path: frontend/package-lock.json

    - name: Install dependencies
      working-directory: ./frontend
      run: npm ci

    - name: Run tests
      working-directory: ./frontend
      run: npm run test:ci
      env:
        MONGODB_URL: mongodb://localhost:27017/test
        OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

    - name: Generate coverage report
      working-directory: ./frontend
      run: npm run test:coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./frontend/coverage/lcov.info
        flags: unittests
        name: codecov-umbrella
```

## Test Quality Gates

### Coverage Requirements
- **Minimum Coverage**: 75% for all metrics (lines, functions, branches, statements)
- **Critical Path Coverage**: 90%+ for agent, MCP hub, and tool implementations
- **Integration Coverage**: 80%+ for end-to-end workflows

### Test Execution Requirements
- **All Tests Pass**: No failing tests in CI/CD pipeline
- **Performance Tests**: Response times within acceptable limits
- **Security Tests**: No vulnerabilities detected in dependency scan
- **Load Tests**: System stable under expected concurrent load

### Quality Metrics
- **Test Execution Time**: < 5 minutes for full test suite
- **Flaky Test Rate**: < 2% test failure rate due to timing/environment issues
- **Code Coverage Trend**: Coverage should not decrease between releases
- **Test Maintenance**: Tests updated with feature changes

## Debugging Tests

### Common Test Issues

1. **MCP Server Connection Failures:**
   ```typescript
   // Debug MCP server startup
   console.log('Starting MCP server with args:', args);
   console.log('Environment variables:', process.env);

   // Add timeout handling
   const serverPromise = startMcpServer();
   const timeoutPromise = new Promise((_, reject) =>
     setTimeout(() => reject(new Error('Server startup timeout')), 10000)
   );
   await Promise.race([serverPromise, timeoutPromise]);
   ```

2. **Async Test Timing Issues:**
   ```typescript
   // Use proper async/await patterns
   test('async operation', async () => {
     const result = await someAsyncOperation();
     expect(result).toBeDefined();
   });

   // Add proper cleanup
   afterEach(async () => {
     await cleanupMcpConnections();
   });
   ```

3. **Mock Data Consistency:**
   ```typescript
   // Reset mocks between tests
   beforeEach(() => {
     jest.clearAllMocks();
     fetchMock.resetMocks();
   });

   // Use consistent test data
   const testData = createConsistentTestData();
   ```

### Test Debugging Tools

**Debug Commands:**
```bash
# Run tests with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Run specific test with verbose output
npm test -- --verbose agent.test.ts

# Run tests with coverage debugging
npm test -- --coverage --verbose --no-cache
```

## Conclusion

This comprehensive testing guide ensures the reliability and maintainability of the MCP integrated todo application. The combination of automated unit tests, integration tests, and manual testing procedures provides confidence in the system's functionality across all components.

**Key Testing Principles:**
- **Test Early**: Write tests alongside feature development
- **Test Thoroughly**: Cover happy paths, edge cases, and error scenarios
- **Test Realistically**: Use production-like test environments
- **Test Continuously**: Integrate testing into CI/CD pipelines
- **Test Measurably**: Maintain coverage metrics and quality gates

The testing strategy supports both current functionality and future development by providing a robust foundation for change detection and regression prevention.
