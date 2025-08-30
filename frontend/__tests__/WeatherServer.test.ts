/**
 * @jest-environment node
 */

// Mock the MCP Server
const mockServer = {
  tool: jest.fn(),
  startStdio: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@modelcontextprotocol/sdk/server', () => ({
  Server: jest.fn().mockImplementation(() => mockServer)
}));

describe('Weather Server', () => {
  beforeEach(() => {
    mockServer.tool.mockClear();
    mockServer.startStdio.mockClear();
    process.env.OPENWEATHER_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Weather Server Tools', () => {
    it('should register all weather tools', async () => {
      await import('../src/weather-server');

      expect(mockServer.tool).toHaveBeenCalledWith('weather.current', expect.objectContaining({
        description: 'Get current weather conditions for a specific location',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));

      expect(mockServer.tool).toHaveBeenCalledWith('weather.forecast', expect.objectContaining({
        description: 'Get weather forecast for multiple days',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));

      expect(mockServer.tool).toHaveBeenCalledWith('weather.alerts', expect.objectContaining({
        description: 'Check for weather alerts in a specific location',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));
    });
  });

  describe('Current Weather', () => {
    let currentWeatherHandler: Function;

    beforeEach(async () => {
      await import('../src/weather-server');

      const currentWeatherCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.current');
      currentWeatherHandler = currentWeatherCall[1].handler;
    });

    it('should return weather for known cities', async () => {
      const result = await currentWeatherHandler({
        location: 'New York',
        units: 'metric'
      });

      expect(result).toEqual({
        ok: true,
        weather: expect.objectContaining({
          location: 'New York, NY',
          temperature: expect.any(Number),
          description: expect.any(String),
          humidity: expect.any(Number),
          windSpeed: expect.any(Number),
          condition: expect.any(String),
          temperature_display: expect.stringMatching(/\d+°C/),
          wind_speed_display: expect.stringMatching(/\d+ km\/h/)
        })
      });
    });

    it('should handle different temperature units', async () => {
      const metricResult = await currentWeatherHandler({
        location: 'London',
        units: 'metric'
      });

      const imperialResult = await currentWeatherHandler({
        location: 'London',
        units: 'imperial'
      });

      const kelvinResult = await currentWeatherHandler({
        location: 'London',
        units: 'kelvin'
      });

      expect(metricResult.weather.temperature_display).toMatch(/°C$/);
      expect(imperialResult.weather.temperature_display).toMatch(/°F$/);
      expect(kelvinResult.weather.temperature_display).toMatch(/K$/);

      expect(imperialResult.weather.wind_speed_display).toMatch(/mph$/);
      expect(metricResult.weather.wind_speed_display).toMatch(/km\/h$/);
    });

    it('should generate random weather for unknown cities', async () => {
      const result = await currentWeatherHandler({
        location: 'Unknown City',
        units: 'metric'
      });

      expect(result).toEqual({
        ok: true,
        weather: expect.objectContaining({
          location: 'Unknown City',
          temperature: expect.any(Number),
          description: 'Clear sky',
          humidity: expect.any(Number),
          windSpeed: expect.any(Number),
          condition: 'clear',
          temperature_display: expect.stringMatching(/\d+°C/),
          wind_speed_display: expect.stringMatching(/\d+ km\/h/)
        })
      });

      // Temperature should be reasonable (5-35°C)
      expect(result.weather.temperature).toBeGreaterThanOrEqual(5);
      expect(result.weather.temperature).toBeLessThanOrEqual(35);
    });

    it('should handle case insensitive city matching', async () => {
      const lowerCaseResult = await currentWeatherHandler({
        location: 'tokyo',
        units: 'metric'
      });

      const upperCaseResult = await currentWeatherHandler({
        location: 'TOKYO',
        units: 'metric'
      });

      expect(lowerCaseResult.weather.location).toBe('Tokyo, Japan');
      expect(upperCaseResult.weather.location).toBe('Tokyo, Japan');
    });
  });

  describe('Weather Forecast', () => {
    let forecastHandler: Function;

    beforeEach(async () => {
      await import('../src/weather-server');

      const forecastCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.forecast');
      forecastHandler = forecastCall[1].handler;
    });

    it('should return forecast for specified number of days', async () => {
      const result = await forecastHandler({
        location: 'San Francisco',
        days: 3,
        units: 'metric'
      });

      expect(result).toEqual({
        ok: true,
        forecast: expect.objectContaining({
          location: 'San Francisco, CA',
          forecast: expect.arrayContaining([
            expect.objectContaining({
              date: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
              temperature: expect.any(Number),
              description: expect.any(String),
              humidity: expect.any(Number),
              windSpeed: expect.any(Number),
              temperature_display: expect.stringMatching(/\d+°C/),
              wind_speed_display: expect.stringMatching(/\d+ km\/h/)
            })
          ])
        })
      });

      expect(result.forecast.forecast).toHaveLength(3);
    });

    it('should default to 3 days when not specified', async () => {
      const result = await forecastHandler({
        location: 'London',
        units: 'metric'
      });

      expect(result.forecast.forecast).toHaveLength(3);
    });

    it('should respect maximum of 5 days', async () => {
      const result = await forecastHandler({
        location: 'London',
        days: 10, // Should be capped at 5
        units: 'metric'
      });

      expect(result.forecast.forecast.length).toBeLessThanOrEqual(5);
    });

    it('should include consecutive dates starting from today', async () => {
      const today = new Date();
      const result = await forecastHandler({
        location: 'Tokyo',
        days: 2,
        units: 'metric'
      });

      const expectedDate1 = new Date(today).toISOString().split('T')[0];
      const expectedDate2 = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      expect(result.forecast.forecast[0].date).toBe(expectedDate1);
      expect(result.forecast.forecast[1].date).toBe(expectedDate2);
    });

    it('should vary temperatures across forecast days', async () => {
      const result = await forecastHandler({
        location: 'New York',
        days: 5,
        units: 'metric'
      });

      const temperatures = result.forecast.forecast.map(day => day.temperature);

      // Temperatures should vary (not all the same)
      const uniqueTemps = new Set(temperatures);
      expect(uniqueTemps.size).toBeGreaterThan(1);
    });
  });

  describe('Weather Alerts', () => {
    let alertsHandler: Function;

    beforeEach(async () => {
      await import('../src/weather-server');

      const alertsCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.alerts');
      alertsHandler = alertsCall[1].handler;
    });

    it('should return no active alerts for most locations', async () => {
      const result = await alertsHandler({
        location: 'Seattle'
      });

      expect(result).toEqual({
        ok: true,
        location: 'Seattle',
        alerts: ['No active weather alerts for Seattle']
      });
    });

    it('should handle different location formats', async () => {
      const cityResult = await alertsHandler({
        location: 'Portland'
      });

      const coordinatesResult = await alertsHandler({
        location: '45.5152,-122.6784'
      });

      expect(cityResult.ok).toBe(true);
      expect(coordinatesResult.ok).toBe(true);
      expect(cityResult.location).toBe('Portland');
      expect(coordinatesResult.location).toBe('45.5152,-122.6784');
    });
  });

  describe('Error Handling', () => {
    let currentWeatherHandler: Function;
    let forecastHandler: Function;

    beforeEach(async () => {
      await import('../src/weather-server');

      const currentWeatherCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.current');
      const forecastCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.forecast');

      currentWeatherHandler = currentWeatherCall[1].handler;
      forecastHandler = forecastCall[1].handler;
    });

    it('should handle errors in current weather gracefully', async () => {
      // Mock an error in the weather function by overriding global functions
      const originalMathRandom = Math.random;
      Math.random = () => { throw new Error('Simulated error'); };

      const result = await currentWeatherHandler({
        location: 'Error City',
        units: 'metric'
      });

      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining('Failed to get weather for Error City')
      });

      // Restore original function
      Math.random = originalMathRandom;
    });

    it('should handle errors in forecast gracefully', async () => {
      // Mock an error in the forecast function
      const originalMathRandom = Math.random;
      Math.random = () => { throw new Error('Forecast error'); };

      const result = await forecastHandler({
        location: 'Error City',
        days: 3,
        units: 'metric'
      });

      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining('Failed to get forecast for Error City')
      });

      // Restore original function
      Math.random = originalMathRandom;
    });
  });

  describe('Schema Validation', () => {
    it('should have proper Zod schemas for input validation', async () => {
      await import('../src/weather-server');

      // Check that the tool calls include inputSchema
      const currentWeatherCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.current');
      const forecastCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.forecast');
      const alertsCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.alerts');

      expect(currentWeatherCall[1]).toHaveProperty('inputSchema');
      expect(forecastCall[1]).toHaveProperty('inputSchema');
      expect(alertsCall[1]).toHaveProperty('inputSchema');
    });
  });

  describe('Mock Data Quality', () => {
    let currentWeatherHandler: Function;

    beforeEach(async () => {
      await import('../src/weather-server');

      const currentWeatherCall = mockServer.tool.mock.calls.find(call => call[0] === 'weather.current');
      currentWeatherHandler = currentWeatherCall[1].handler;
    });

    it('should provide realistic weather data for known cities', async () => {
      const cities = ['new york', 'london', 'tokyo', 'san francisco'];

      for (const city of cities) {
        const result = await currentWeatherHandler({
          location: city,
          units: 'metric'
        });

        expect(result.ok).toBe(true);
        expect(result.weather.temperature).toBeGreaterThan(-50);
        expect(result.weather.temperature).toBeLessThan(60);
        expect(result.weather.humidity).toBeGreaterThanOrEqual(0);
        expect(result.weather.humidity).toBeLessThanOrEqual(100);
        expect(result.weather.windSpeed).toBeGreaterThanOrEqual(0);
        expect(result.weather.description).toBeTruthy();
        expect(result.weather.condition).toBeTruthy();
      }
    });
  });
});
