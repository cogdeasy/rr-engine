import type { FastifyInstance } from "fastify";
import type { StatusLevel } from "@rr/types";
import { engineExplorerData, paginate } from "@rr/data";

/**
 * Engine explorer: the ranked engine register behind `/engines`.
 *
 * One endpoint, one responsibility — return the register (optionally filtered)
 * together with the facet counts and summary the explorer renders.
 */
export async function registerEngineExplorerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      status?: StatusLevel;
      family?: string;
      operatorId?: string;
      maxEgtMargin?: string;
      maxDaysToShopVisit?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    };
  }>("/engine-explorer/register", async (request) => {
    const { status, family, operatorId, maxEgtMargin, maxDaysToShopVisit, search, page = "1", pageSize = "50" } =
      request.query;
    const { rows, facets, summary, savedViews } = engineExplorerData();

    const query = search?.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (family && row.family !== family) return false;
      if (operatorId && row.operatorId !== operatorId) return false;
      if (maxEgtMargin !== undefined && row.egtMargin >= Number(maxEgtMargin)) return false;
      if (maxDaysToShopVisit !== undefined) {
        if (row.daysToShopVisit === null || row.daysToShopVisit > Number(maxDaysToShopVisit)) return false;
      }
      if (query && !`${row.esn} ${row.aircraftTail ?? ""} ${row.operatorName}`.toLowerCase().includes(query)) return false;
      return true;
    });

    return { ...paginate(filtered, Number(page), Number(pageSize)), facets, summary, savedViews };
  });
}
