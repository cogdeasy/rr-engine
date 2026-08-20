import type { FastifyInstance } from "fastify";
import type { WorkOrderStage } from "@rr/types";
import {
  getWorkOrderView,
  paginate,
  workOrderBlockerSummary,
  workOrderKpis,
  workOrderStageSummary,
  workOrderViews,
} from "@rr/data";

/**
 * Execution board for the `work-orders` module: enriched orders plus the
 * blocker roll-up that drives the "what is blocking work today?" decision.
 */
export async function registerWorkOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { stage?: WorkOrderStage; blocked?: string; page?: string; pageSize?: string };
  }>("/work-orders/board", async (request) => {
    const { stage, blocked, page = "1", pageSize = "50" } = request.query;
    let views = workOrderViews();
    if (stage) views = views.filter((v) => v.stage === stage);
    if (blocked === "true") views = views.filter((v) => v.blockers.length > 0);
    return {
      ...paginate(views, Number(page), Number(pageSize)),
      kpis: workOrderKpis(),
      stages: workOrderStageSummary(),
      blockers: workOrderBlockerSummary(),
    };
  });

  app.get<{ Params: { reference: string } }>("/work-orders/board/:reference", async (request, reply) => {
    const view = getWorkOrderView(request.params.reference);
    if (!view) return reply.code(404).send({ error: "not_found", message: "Unknown work order", statusCode: 404 });
    return view;
  });
}
