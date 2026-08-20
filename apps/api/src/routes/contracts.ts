import type { FastifyInstance } from "fastify";
import { contractPortfolioSummary, contractPosition, contractPositions, contractsAtRisk } from "@rr/data";

/**
 * Contracts & TotalCare. One endpoint for the portfolio roll-up, one for the
 * derived register and one for a single contract dossier. The raw register
 * lives on core's `GET /contracts`, so the derived positions sit below it.
 */
export async function registerContractRoutes(app: FastifyInstance): Promise<void> {
  app.get("/contracts/summary", async () => contractPortfolioSummary());

  app.get<{ Querystring: { risk?: "all" | "exposed" } }>("/contracts/positions", async (request) => {
    return request.query.risk === "exposed" ? contractsAtRisk() : contractPositions();
  });

  app.get<{ Params: { contractId: string } }>("/contracts/:contractId", async (request, reply) => {
    const position = contractPosition(request.params.contractId);
    if (!position) {
      return reply.code(404).send({ error: "not_found", message: "Unknown contract", statusCode: 404 });
    }
    return position;
  });
}
