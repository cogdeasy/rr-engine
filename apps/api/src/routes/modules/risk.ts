import type { FastifyInstance } from "fastify";
import type { RiskConsequenceClass, StatusLevel } from "@rr/types";
import { getRiskBoard } from "@rr/data";

/**
 * Failure risk board (`risk`, /predict/risk): the fleet risk matrix, the ranked
 * register and the exposure trend. The aggregates are always fleet-wide; the
 * query only narrows and pages the `items` register.
 */
export async function registerRiskRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: StatusLevel; consequence?: RiskConsequenceClass; operatorId?: string; limit?: string } }>(
    "/risk/board",
    async (request) => {
      const { status, consequence, operatorId, limit = "100" } = request.query;
      const board = getRiskBoard();
      const items = board.items.filter(
        (item) =>
          (!status || item.status === status) &&
          (!consequence || item.consequenceClass === consequence) &&
          (!operatorId || item.operatorId === operatorId),
      );
      return { ...board, items: items.slice(0, Math.max(1, Math.min(500, Number(limit) || 100))) };
    },
  );
}
