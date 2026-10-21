import { proxyHistory } from '../../../lib/history-api';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return proxyHistory(request, { backendUrl: process.env.BACKEND_URL, token: process.env.API_TOKEN });
}
