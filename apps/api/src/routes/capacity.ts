import type { FastifyInstance } from "fastify";
import { capacityOverview, facilityCapacity } from "@rr/data";

/**
 * Shop capacity: the 12-month slot picture for the shop network, plus the
 * per-facility view behind the heat grid.
 */
export async function registerCapacityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/capacity/overview", async () => capacityOverview());

  app.get<{ Params: { facilityId: string } }>("/capacity/facilities/:facilityId", async (request, reply) => {
    const facility = facilityCapacity(request.params.facilityId);
    if (!facility) {
      return reply.code(404).send({ error: "not_found", message: "Unknown shop facility", statusCode: 404 });
    }
    return facility;
  });
}
