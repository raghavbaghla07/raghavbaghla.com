import type { APIRoute } from 'astro';

export const GET: APIRoute = () => new Response('RSS has been retired. Subscribe by email at https://raghavbaghla.com/writing/.', { status: 410 });
