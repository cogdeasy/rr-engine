import type { FastifyInstance } from "fastify";
import { workforceOverview, workforceRoster } from "@rr/data";

/** Read endpoints for the workforce & skills module. */
export async function registerWorkforceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/workforce/overview", async () => workforceOverview());

  app.get<{ Querystring: { facilityId?: string } }>("/workforce/roster", async (request) =>
    workforceRoster(request.query.facilityId),
  );

  app.get("/workforce/coverage", async () => {
    const { coverage, coverageByFacility, shifts } = workforceOverview();
    return { coverage, coverageByFacility, shifts };
  });

  app.get("/workforce/assignments", async () => workforceOverview().suggestions);
}
