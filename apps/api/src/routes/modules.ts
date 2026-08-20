import type { FastifyInstance } from "fastify";
import { registerContractRoutes } from "./contracts";
import { registerAlertRoutes } from "./alerts";
import { registerNotificationRoutes } from "./notifications";
import { registerEngineExplorerRoutes } from "./engine-explorer";
import { registerReportsRoutes } from "./modules/reports";
import { registerFleetMapRoutes } from "./modules/fleet-map";
import { registerWorkscopeRoutes } from "./workscope";
import { registerTelemetryQualityRoutes } from "./telemetry-quality";
import { registerComplianceRoutes } from "./compliance";
import { registerScheduleRoutes } from "./modules/schedule";
import { registerOilDebrisRoutes } from "./oil-debris";
import { registerPerformanceRoutes } from "./performance";
import { registerRiskRoutes } from "./modules/risk";
import { registerAuditRoutes } from "./audit";

/**
 * Feature-module routes.
 *
 * Each feature module owns a file in `src/routes/modules/<module-id>.ts`
 * exporting `register<ModuleName>Routes(app)`, and adds exactly one import plus
 * one call below so parallel branches conflict on a single line at most.
 */
import { registerAogRoutes } from "./aog";

import { registerWorkOrderRoutes } from "./work-orders";

export async function registerModuleRoutes(app: FastifyInstance): Promise<void> {
  await registerAogRoutes(app);
  await registerContractRoutes(app);
  await registerAlertRoutes(app);
  await registerNotificationRoutes(app);
  await registerEngineExplorerRoutes(app);
  await registerReportsRoutes(app);
  await registerFleetMapRoutes(app);
  await registerWorkscopeRoutes(app);
  await registerTelemetryQualityRoutes(app);
  await registerComplianceRoutes(app);
  await registerScheduleRoutes(app);
  await registerOilDebrisRoutes(app);
  await registerWorkOrderRoutes(app);
  await registerPerformanceRoutes(app);
  void app;
  await registerRiskRoutes(app);
  await registerAuditRoutes(app);
}
