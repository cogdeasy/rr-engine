import type { FastifyInstance } from "fastify";
import type { Region, StatusLevel } from "@rr/types";
import { getFleetMapSnapshot } from "@rr/data";

/**
 * Fleet map snapshot: aircraft positions, maintenance stations and the
 * reachability maths that answers "can a station act on this engine in time?".
 */
export async function registerFleetMapRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: StatusLevel; region?: Region; operatorId?: string; unreachableOnly?: string } }>(
    "/modules/fleet-map/snapshot",
    async (request) => {
      const snapshot = getFleetMapSnapshot();
      const { status, region, operatorId, unreachableOnly } = request.query;
      const aircraft = snapshot.aircraft.filter(
        (node) =>
          (!status || node.status === status) &&
          (!region || node.region === region) &&
          (!operatorId || node.operatorId === operatorId) &&
          (unreachableOnly !== "true" || node.outOfReach),
      );
      return { ...snapshot, aircraft };
    },
  );
}
