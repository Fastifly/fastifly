import type { FastifyInstance } from "fastify";
import type { RegisterFinanceRoutesOptions as RegisterOptions } from "./contracts.js";
import { registerFinanceImportWorkflowRoutes } from "./workflows-imports.js";
import { registerFinanceRecurringWorkflowRoutes } from "./workflows-recurring.js";
import { registerFinanceRuleWorkflowRoutes } from "./workflows-rules.js";

export function registerFinanceWorkflowRoutes(
  app: FastifyInstance,
  options: RegisterOptions,
): void {
  const { workflowService } = options;

  if (!workflowService) {
    return;
  }

  registerFinanceImportWorkflowRoutes(app, workflowService);
  registerFinanceRuleWorkflowRoutes(app, workflowService);
  registerFinanceRecurringWorkflowRoutes(app, workflowService);
}
