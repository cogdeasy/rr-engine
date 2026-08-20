import type { FastifyInstance } from "fastify";
import { environmentExposureReport } from "@rr/data";

/**
 * Environmental exposure: one endpoint returning the full severity report
 * (airports, routes, engines, correlation and interval recommendations).
 */
export async function registerEnvironmentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/environment/exposure", async () => environmentExposureReport());
}
