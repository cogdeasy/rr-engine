import type { FastifyInstance } from "fastify";
import {
  facilityStockSummaries,
  inventorySummary,
  moduleStockValues,
  partDemandLines,
  rotablePool,
  rotablePoolSummary,
  shortageLines,
  slowMovers,
  stockPositions,
} from "@rr/data";

/**
 * Parts & inventory read endpoints: stock positions, the 90-day shortage board,
 * the rotable pool and the value roll-up.
 */
export async function registerInventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/inventory/summary", async () => ({
    summary: inventorySummary(),
    facilities: facilityStockSummaries(),
    modules: moduleStockValues(),
  }));

  app.get<{ Querystring: { facilityId?: string; status?: string; short?: string } }>(
    "/inventory/positions",
    async (request) => {
      const { facilityId, status, short } = request.query;
      let positions = stockPositions();
      if (facilityId) positions = positions.filter((p) => p.facilityId === facilityId);
      if (status) positions = positions.filter((p) => p.status === status);
      if (short === "true") positions = positions.filter((p) => p.shortfall > 0);
      return positions;
    },
  );

  app.get<{ Querystring: { blockingOnly?: string } }>("/inventory/shortages", async (request) => {
    const shortages = shortageLines();
    return request.query.blockingOnly === "true"
      ? shortages.filter((s) => s.position.blockingDemand > 0)
      : shortages;
  });

  app.get("/inventory/demand", async () => partDemandLines());

  app.get("/inventory/rotables", async () => ({ summary: rotablePoolSummary(), entries: rotablePool() }));

  app.get("/inventory/slow-movers", async () => slowMovers());
}
