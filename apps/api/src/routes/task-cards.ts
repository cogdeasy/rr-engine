import type { FastifyInstance } from "fastify";
import {
  activeTaskCardExecutions,
  taskCardExecution,
  taskCardSummary,
  taskCardVarianceDrivers,
  workOrderCardProgress,
} from "@rr/data";

/**
 * Task card execution endpoints — the shop-floor view of the cards on live work
 * orders, their man-hour variance and their sign-off state.
 */
export async function registerTaskCardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { facilityId?: string; skill?: string; state?: string; awaitingInspection?: string } }>(
    "/task-cards/execution",
    async (request) => {
      const { facilityId, skill, state, awaitingInspection } = request.query;
      let cards = activeTaskCardExecutions();
      if (facilityId) cards = cards.filter((c) => c.facilityId === facilityId);
      if (skill) cards = cards.filter((c) => c.skillRequired === skill);
      if (state) cards = cards.filter((c) => c.state === state);
      if (awaitingInspection === "true") cards = cards.filter((c) => c.awaitingInspection);
      return {
        summary: taskCardSummary(cards),
        drivers: taskCardVarianceDrivers(cards),
        workOrders: workOrderCardProgress(cards),
        cards,
      };
    },
  );

  app.get<{ Params: { cardId: string } }>("/task-cards/:cardId/execution", async (request, reply) => {
    const execution = taskCardExecution(request.params.cardId);
    if (!execution) return reply.code(404).send({ error: "not_found", message: "Unknown task card", statusCode: 404 });
    return execution;
  });
}
