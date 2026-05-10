import {
  AuthCredentialsSchema,
  CursorPaginationQuerySchema,
  MoneyAmountSchema,
} from "@fastifly/common";
import { isSensitiveRequestPath, shouldRegisterServiceWorker } from "./pwa";
import { readPendingOutboxCount } from "./sync/outbox";
import {
  getCurrentNavigationItem,
  getMobilePrimaryNavigation,
  MAX_MOBILE_TABS,
} from "./ui/navigation";

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

export const webNavigationSmoke = {
  getCurrentNavigationItem,
  getMobilePrimaryNavigation,
  maxMobileTabs: MAX_MOBILE_TABS,
};
