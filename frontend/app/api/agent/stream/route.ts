/**
 * App Router route handler for agent SSE streaming.
 *
 * Pages API routes buffer responses before delivery, which breaks real-time
 * token streaming. The App Router's native Response + ReadableStream pipes
 * the backend SSE stream directly to the browser with no buffering.
 *
 * Content-Encoding: identity prevents Next.js gzip middleware from
 * buffering the full body before delivery — gzip requires the complete
 * response to compress, which would make all tokens arrive at once.
 */
const BACKEND_URL = (
  process.env.NODE_ENV === 'production'
    ? process.env.BACKEND_URL || 'http://localhost:8000'
    : 'http://localhost:8000'
).replace(/\/$/, '');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Forward all query params to the backend
  const params = new URLSearchParams();
  searchParams.forEach((value, key) => params.set(key, value));

  const backendUrl = `${BACKEND_URL}/agent/stream?${params.toString()}`;

  const backendResponse = await fetch(backendUrl, {
    headers: {
      Accept: 'text/event-stream',
    },
  });

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response('Backend error', { status: backendResponse.status });
  }

  return new Response(backendResponse.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'identity',
    },
  });
}
