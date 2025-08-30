// Weather MCP server - Provides weather information
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Weather API configuration (using OpenWeatherMap as example)
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'demo_key';
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5';

interface WeatherData {
  location: string;
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  condition: string;
}

// Using JSON Schema directly instead of Zod for MCP compatibility

// Mock weather data for demo (replace with real API in production)
const mockWeatherData: Record<string, WeatherData> = {
  "new york": {
    location: "New York, NY",
    temperature: 22,
    description: "Partly cloudy",
    humidity: 65,
    windSpeed: 8,
    condition: "partly_cloudy"
  },
  "london": {
    location: "London, UK",
    temperature: 15,
    description: "Light rain",
    humidity: 80,
    windSpeed: 12,
    condition: "rainy"
  },
  "tokyo": {
    location: "Tokyo, Japan",
    temperature: 28,
    description: "Clear sky",
    humidity: 55,
    windSpeed: 5,
    condition: "clear"
  },
  "san francisco": {
    location: "San Francisco, CA",
    temperature: 18,
    description: "Foggy",
    humidity: 85,
    windSpeed: 6,
    condition: "foggy"
  }
};

async function getCurrentWeather(location: string, units: string): Promise<WeatherData> {
  // In a real implementation, you would call the weather API:
  /*
  const response = await fetch(
    `${WEATHER_API_URL}/weather?q=${encodeURIComponent(location)}&appid=${WEATHER_API_KEY}&units=${units}`
  );
  const data = await response.json();
  */

  // For demo, return mock data
  const normalizedLocation = location.toLowerCase();
  const weatherData = mockWeatherData[normalizedLocation] || {
    location,
    temperature: Math.floor(Math.random() * 30) + 5,
    description: "Clear sky",
    humidity: Math.floor(Math.random() * 40) + 40,
    windSpeed: Math.floor(Math.random() * 15) + 2,
    condition: "clear"
  };

  // Convert temperature units if needed
  if (units === "imperial") {
    weatherData.temperature = Math.round(weatherData.temperature * 9/5 + 32);
  } else if (units === "kelvin") {
    weatherData.temperature = Math.round(weatherData.temperature + 273.15);
  }

  return weatherData;
}

async function getWeatherForecast(location: string, days: number, units: string) {
  const currentWeather = await getCurrentWeather(location, units);

  // Generate mock forecast data
  const forecast = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    const tempVariation = Math.random() * 10 - 5; // ±5 degrees variation
    forecast.push({
      date: date.toISOString().split('T')[0],
      temperature: Math.round(currentWeather.temperature + tempVariation),
      description: i === 0 ? currentWeather.description :
        ["Sunny", "Partly cloudy", "Cloudy", "Light rain", "Clear"][Math.floor(Math.random() * 5)],
      humidity: Math.floor(Math.random() * 40) + 40,
      windSpeed: Math.floor(Math.random() * 15) + 2,
    });
  }

  return {
    location: currentWeather.location,
    forecast
  };
}

export async function startWeatherServerOverStdio() {
  const server = new McpServer({
    name: "weather",
    version: "0.1.0",
  }, { capabilities: {} });
  const WeatherCurrentSchema = z.object({
    location: z.string().min(1).describe("City name (e.g., 'Tokyo', 'New York')"),
    units: z.enum(['metric', 'imperial', 'kelvin']).default('metric').describe("Temperature units")
  });

  server.registerTool("weather.current", {
    description: "Get current weather conditions for a specific location. Pass location as a string parameter.",
    inputSchema: WeatherCurrentSchema.shape
  }, async ({ location, units }) => {
    const defaultLocation = location || "Tokyo"; // Default location
    const defaultUnits = units || "metric";
      try {
        const weather = await getCurrentWeather(defaultLocation, defaultUnits);
        const unitSymbol = defaultUnits === "imperial" ? "°F" : defaultUnits === "kelvin" ? "K" : "°C";

        return {
          ok: true,
          weather: {
            ...weather,
            temperature_display: `${weather.temperature}${unitSymbol}`,
            wind_speed_display: units === "imperial" ?
              `${Math.round(weather.windSpeed * 0.621371)} mph` :
              `${weather.windSpeed} km/h`
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: `Failed to get weather for ${location}: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    });

  const WeatherForecastSchema = z.object({
    location: z.string().min(1).describe("City name"),
    days: z.number().min(1).max(5).default(3).describe("Number of forecast days (1-5)"),
    units: z.enum(['metric', 'imperial', 'kelvin']).default('metric').describe("Temperature units")
  });

  server.registerTool("weather.forecast", {
    description: "Get weather forecast for multiple days",
    inputSchema: WeatherForecastSchema.shape
  }, async ({ location, days, units }) => {
      try {
        const defaultedDays = days || 3;
        const defaultedUnits = units || "metric";
        const forecast = await getWeatherForecast(location, defaultedDays, defaultedUnits);
        const unitSymbol = defaultedUnits === "imperial" ? "°F" : defaultedUnits === "kelvin" ? "K" : "°C";

        return {
          ok: true,
          forecast: {
            ...forecast,
            forecast: forecast.forecast.map(day => ({
              ...day,
              temperature_display: `${day.temperature}${unitSymbol}`,
              wind_speed_display: defaultedUnits === "imperial" ?
                `${Math.round(day.windSpeed * 0.621371)} mph` :
                `${day.windSpeed} km/h`
            }))
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: `Failed to get forecast for ${location}: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    });

  const WeatherAlertsSchema = z.object({
    location: z.string().min(1).describe("City name or coordinates")
  });

  server.registerTool("weather.alerts", {
    description: "Check for weather alerts in a specific location",
    inputSchema: WeatherAlertsSchema.shape
  }, async ({ location }) => {
      // Mock alerts - in production, this would query a real weather alerts API
      const mockAlerts = [
        "No active weather alerts for " + location,
        // Uncomment for testing alerts:
        // "⚠️ High wind warning in effect until 6PM",
        // "❄️ Winter storm watch beginning tonight"
      ];

      return {
        ok: true,
        location,
        alerts: mockAlerts.slice(0, 1) // Just return no alerts for demo
      };
    });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Start the server when this file is executed directly
if (require.main === module) {
  startWeatherServerOverStdio();
}
