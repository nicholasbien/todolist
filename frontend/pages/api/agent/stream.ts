import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { McpHub } from '../../../src/mcp-hub';
import { runAgent } from '../../../src/agent';
import { OpenAILlm } from '../../../src/openai-llm';

function sseWrite(res: NextApiResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Extract auth token from request (query param or header)
function getAuthToken(req: NextApiRequest): string | null {
  // Try query param first (for EventSource)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }

  // Fall back to Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

// Extract space ID from request
function getCurrentSpaceId(req: NextApiRequest): string | null {
  return (req.query.space_id as string) || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let hub: McpHub | null = null;

  // Handle client disconnect to ensure cleanup
  req.on('close', async () => {
    if (hub) {
      try {
        await hub.dispose();
      } catch (error) {
        console.error('Error disposing MCP hub on client disconnect:', error);
      }
    }
  });

  try {
    // Get OpenAI API key from environment
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      sseWrite(res, 'error', { message: 'OpenAI API key not configured' });
      res.end();
      return;
    }

    // Get auth context
    const authToken = getAuthToken(req);
    const spaceId = getCurrentSpaceId(req);

    // Initialize LLM
    const llm = new OpenAILlm(openaiApiKey);

    // Initialize MCP Hub with multiple servers
    hub = new McpHub();
    const tsxCommand = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

    // Set up environment variables for the servers
    const serverEnv = {
      ...process.env,
      AUTH_TOKEN: authToken,
      CURRENT_SPACE_ID: spaceId,
    };

    // Add memory server (connected to real backend)
    await hub.addBuiltinMemory('memory', tsxCommand, ['src/memory-server.ts'], undefined, serverEnv);

    // Add weather server
    await hub.addBuiltinMemory('weather', tsxCommand, ['src/weather-server.ts'], undefined, serverEnv);

    sseWrite(res, 'ready', {
      ok: true,
      tools: hub.listAllTools().map(t => t.fq),
      space_id: spaceId
    });

    const userMessage = typeof req.query.q === 'string' ? req.query.q : 'Hello! How can I help you with your tasks or get weather information?';

    for await (const ev of runAgent({ llm, hub, userMessage })) {
      if (ev.type === 'text') {
        sseWrite(res, 'token', { token: ev.token });
      }
      if (ev.type === 'tool_result') {
        sseWrite(res, 'tool_result', { tool: ev.tool, data: ev.data });
      }
    }

    sseWrite(res, 'done', { ok: true });
  } catch (e: any) {
    console.error('Agent stream error:', e);
    sseWrite(res, 'error', { message: e?.message ?? String(e) });
  } finally {
    // Always clean up hub resources to prevent process leaks
    if (hub) {
      try {
        await hub.dispose();
      } catch (error) {
        console.error('Error disposing MCP hub:', error);
      }
    }
    res.end();
  }
}
