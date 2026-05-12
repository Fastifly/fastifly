import type { FastifyInstance } from "fastify";
import { registerFinanceAccountRoutes } from "./accounts.js";
import { registerFinanceBudgetRoutes } from "./budgets.js";
import { registerFinanceCategoryRoutes } from "./categories.js";
import type { RegisterFinanceRoutesOptions } from "./contracts.js";
import { registerFinanceMutationRoutes } from "./mutations.js";
import { registerFinanceReportRoutes } from "./reports.js";
import { registerFinanceTransactionRoutes } from "./transactions.js";
import { registerFinanceWorkflowRoutes } from "./workflows.js";

export async function registerFinanceRoutes(
  app: FastifyInstance,
  options: RegisterFinanceRoutesOptions,
): Promise<void> {
  registerFinanceAccountRoutes(app, options);
  registerFinanceCategoryRoutes(app, options);
  registerFinanceBudgetRoutes(app, options);
  registerFinanceMutationRoutes(app, options);
  registerFinanceTransactionRoutes(app, options);
  registerFinanceReportRoutes(app, options);
  registerFinanceWorkflowRoutes(app, options);
}
