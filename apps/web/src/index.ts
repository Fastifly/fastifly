import {
  AuthCredentialsSchema,
  CursorPaginationQuerySchema,
  MoneyAmountSchema,
} from "@fastifly/common";
import { isSensitiveRequestPath, shouldRegisterServiceWorker } from "./pwa";
import { readPendingOutboxCount } from "./sync/outbox";

export const webPackageName = "@fastifly/web";

export const webSharedContractSmoke = {
  authCredentialsSchema: AuthCredentialsSchema,
  moneySchema: MoneyAmountSchema,
  paginationQuerySchema: CursorPaginationQuerySchema,
};

export const webPwaSafetySmoke = {
  isSensitiveRequestPath,
  readPendingOutboxCount,
  shouldRegisterServiceWorker,
};
