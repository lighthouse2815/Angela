import { startBackgroundTokenRefresh } from "@/sse/services/backgroundTokenRefresh.js";

// DashboardGuard requires a management session or local CLI token for this route.
// Do not initialize the upstream DNS, tunnel, MITM, or global process-cleanup services.
export async function POST() {
  startBackgroundTokenRefresh();
  return Response.json({ started: true });
}
