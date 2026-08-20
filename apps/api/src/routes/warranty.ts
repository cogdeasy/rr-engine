import type { FastifyInstance } from "fastify";
import type { WarrantyClaimState } from "@rr/types";
import {
  getWarrantyClaim,
  getWarrantyClaims,
  isWarrantyClaimOpen,
  paginate,
  warrantyAgeing,
  warrantyEligibility,
  warrantyRejectionBreakdown,
  warrantySummary,
} from "@rr/data";

/**
 * Warranty claims — claim register, settlement roll-up and the entitlement
 * check behind "is this repair recoverable?".
 */
export async function registerWarrantyRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { state?: WarrantyClaimState; operatorId?: string; open?: string; page?: string; pageSize?: string } }>(
    "/warranty/claims",
    async (request) => {
      const { state, operatorId, open, page = "1", pageSize = "50" } = request.query;
      let claims = getWarrantyClaims();
      if (state) claims = claims.filter((c) => c.state === state);
      if (operatorId) claims = claims.filter((c) => c.operatorId === operatorId);
      if (open === "true") claims = claims.filter(isWarrantyClaimOpen);
      return paginate(claims, Number(page), Number(pageSize));
    },
  );

  app.get<{ Params: { claimId: string } }>("/warranty/claims/:claimId", async (request, reply) => {
    const claim = getWarrantyClaim(request.params.claimId);
    if (!claim) return reply.code(404).send({ error: "not_found", message: "Unknown claim", statusCode: 404 });
    return claim;
  });

  app.get("/warranty/summary", async () => ({
    ...warrantySummary(),
    ageing: warrantyAgeing(),
    rejections: warrantyRejectionBreakdown(),
  }));

  app.get<{ Params: { engineId: string } }>("/warranty/eligibility/:engineId", async (request, reply) => {
    const eligibility = warrantyEligibility(request.params.engineId);
    if (!eligibility) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    return eligibility;
  });
}
