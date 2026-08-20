import type { FastifyInstance } from "fastify";
import type { StatusLevel } from "@rr/types";
import {
  criticalPartRegister,
  expediteOptions,
  openPurchaseOrders,
  purchaseOrders,
  shortageRisks,
  supplierPerformance,
  supplyChainSummary,
  SUPPLY_CHAIN_HORIZON_DAYS,
} from "@rr/data";

/** Horizon in days, falling back to the default for missing or non-numeric input. */
function horizon(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SUPPLY_CHAIN_HORIZON_DAYS;
}

/**
 * Supply chain read endpoints — shortage risk, purchase order book, supplier
 * performance and the critical part register.
 */
export async function registerSupplyChainRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { horizonDays?: string } }>("/supply-chain/summary", async (request) =>
    supplyChainSummary(horizon(request.query.horizonDays)),
  );

  app.get<{ Querystring: { horizonDays?: string; status?: StatusLevel; supplier?: string } }>(
    "/supply-chain/shortages",
    async (request) => {
      const { horizonDays, status, supplier } = request.query;
      let rows = shortageRisks(horizon(horizonDays));
      if (status) rows = rows.filter((r) => r.status === status);
      if (supplier) rows = rows.filter((r) => r.supplier === supplier);
      return rows;
    },
  );

  app.get<{ Querystring: { horizonDays?: string } }>("/supply-chain/expedites", async (request) =>
    expediteOptions(horizon(request.query.horizonDays)),
  );

  app.get<{ Querystring: { open?: string } }>("/supply-chain/purchase-orders", async (request) =>
    request.query.open === "false" ? purchaseOrders() : openPurchaseOrders(),
  );

  app.get("/supply-chain/suppliers", async () => supplierPerformance());

  app.get("/supply-chain/critical-parts", async () => criticalPartRegister());
}
