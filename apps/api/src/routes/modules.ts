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
import { registerInventoryRoutes } from "./inventory";
import { registerSupplyChainRoutes } from "./supply-chain";
import { registerWarrantyRoutes } from "./warranty";
import { registerCapacityRoutes } from "./capacity";
import { registerReliabilityRoutes } from "./modules/reliability";
import { registerHotSectionRoutes } from "./hot-section";
import { registerTestCellRoutes } from "./modules/test-cell";
import { registerEnvironmentRoutes } from "./modules/environment";
import { registerBorescopeRoutes } from "./borescope";
import { registerPrognosticsRoutes } from "./prognostics";
import { registerBuildRecordsRoutes } from "./modules/build-records";
import { registerWorkforceRoutes } from "./modules/workforce";
import { registerSettingsRoutes } from "./settings";
import { registerOperatorPortalRoutes } from "./operator-portal";
import { registerLlpRoutes } from "./llp";
import { registerSimulationRoutes } from "./modules/simulation";
import { registerEngineDetailRoutes } from "./engine-detail";

/**
 * Feature-module routes.
 *
 * Each feature module owns a file in `src/routes/modules/<module-id>.ts`
 * exporting `register<ModuleName>Routes(app)`, and adds exactly one import plus
 * one call below so parallel branches conflict on a single line at most.
 */
import { registerAogRoutes } from "./aog";

import { registerWorkOrderRoutes } from "./work-orders";

import { registerVibrationRoutes } from "./vibration";

import { registerTaskCardRoutes } from "./task-cards";

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
  await registerInventoryRoutes(app);
  await registerSupplyChainRoutes(app);
  await registerWarrantyRoutes(app);
  await registerCapacityRoutes(app);
  await registerReliabilityRoutes(app);
  await registerHotSectionRoutes(app);
  await registerTestCellRoutes(app);
  await registerEnvironmentRoutes(app);
  await registerBorescopeRoutes(app);
  await registerPrognosticsRoutes(app);
  await registerBuildRecordsRoutes(app);
  await registerWorkforceRoutes(app);
  await registerSettingsRoutes(app);
  await registerOperatorPortalRoutes(app);
  await registerLlpRoutes(app);
  await registerSimulationRoutes(app);
  await registerVibrationRoutes(app);
  await registerTaskCardRoutes(app);
  await registerEngineDetailRoutes(app);
}
