import type { FastifyInstance } from "fastify";
import type { StatusLevel } from "@rr/types";
import { maintenanceSchedule, scheduleEvents } from "@rr/data";

/**
 * Maintenance schedule module: the rolling network plan, optionally filtered to
 * a slice of the fleet. One endpoint, one responsibility.
 */
export async function registerScheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { operatorId?: string; family?: string; facilityId?: string; status?: StatusLevel } }>(
    "/plan/schedule",
    async (request) => {
      const schedule = maintenanceSchedule();
      const { operatorId, family, facilityId, status } = request.query;
      return {
        generatedAt: schedule.generatedAt,
        horizonMonths: schedule.horizonMonths,
        windowStart: schedule.windowStart,
        windowEnd: schedule.windowEnd,
        months: schedule.months,
        kpis: schedule.kpis,
        facilityLoad: schedule.facilityLoad,
        conflicts: schedule.conflicts,
        events: scheduleEvents({ operatorId, family, facilityId, status }),
      };
    },
  );
}
