import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { McpHub } from '../../../src/mcp-hub';
import { runAgent, Llm } from '../../../src/agent';

function sseWrite(res: NextApiResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Mock LLM that emits one tool call then text
const mockLlm: Llm = {
  async *stream() {
    const text = `Let me check your tasks…`;
    for (const ch of text.split(' ')) {
      yield { type: 'text' as const, token: ch + ' ' };
    }
    yield {
      type: 'tool_call' as const,
      tool: 'memory.mem.search',
      args: { query: 'rent', types: ['task'], limit: 5 },
    };
    yield { type: 'text' as const, token: 'Here are relevant items. ' };
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const hub = new McpHub();
  const memoryCommand = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  await hub.addBuiltinMemory('memory', memoryCommand, ['src/memory-server.ts']);

  (async () => {
    try {
      sseWrite(res, 'ready', { ok: true });
      const userMessage = typeof req.query.q === 'string' ? req.query.q : 'Hello';
      for await (const ev of runAgent({ llm: mockLlm, hub, userMessage })) {
        if (ev.type === 'text') sseWrite(res, 'token', { token: ev.token });
        if (ev.type === 'tool_result')
          sseWrite(res, 'tool_result', { tool: ev.tool, data: ev.data });
      }
      sseWrite(res, 'done', { ok: true });
      res.end();
    } catch (e: any) {
      sseWrite(res, 'error', { message: e?.message ?? String(e) });
      res.end();
    }
  })();
}
