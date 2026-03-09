/**
 * App Router route for SSE streaming.
 *
 * Pages Router API routes buffer the entire response before sending,
 * which breaks real-time token streaming. This App Router route uses
 * ReadableStream to pipe the backend SSE directly to the browser.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = (
  process.env.NODE_ENV === 'production'
    ? process.env.BACKEND_URL || 'http://localhost:8000'
    : 'http://localhost:8000'
).replace(/\/$/, '');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const params = new URLSearchParams();
  searchParams.forEach((value, key) => params.set(key, value));

  const backendUrl = `${BACKEND_URL}/agent/stream?${params.toString()}`;

  const backendResponse = await fetch(backendUrl, {
    headers: { Accept: 'text/event-stream' },
  });

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response(
      JSON.stringify({ error: 'Backend streaming error' }),
      { status: backendResponse.status, headers: { 'Content-Type': 'application/json' } },
    );
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
