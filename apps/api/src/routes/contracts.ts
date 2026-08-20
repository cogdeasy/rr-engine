import type { FastifyInstance } from "fastify";
import { contractPortfolioSummary, contractPosition, contractPositions } from "@rr/data";

/**
 * Contracts & TotalCare. One endpoint for the portfolio roll-up, one for the
 * register and one for a single contract dossier.
 */
export async function registerContractRoutes(app: FastifyInstance): Promise<void> {
  app.get("/contracts/summary", async () => contractPortfolioSummary());

  app.get<{ Querystring: { risk?: "all" | "exposed" } }>("/contracts", async (request) => {
    const positions = contractPositions();
    return request.query.risk === "exposed" ? positions.filter((p) => p.status !== "green") : positions;
  });

  app.get<{ Params: { contractId: string } }>("/contracts/:contractId", async (request, reply) => {
    const position = contractPosition(request.params.contractId);
    if (!position) {
      return reply.code(404).send({ error: "not_found", message: "Unknown contract", statusCode: 404 });
    }
    return position;
  });
}
