import {
  AuthCredentialsSchema,
  CursorPaginationQuerySchema,
  DEFAULT_DEMO_LOGIN,
  LoginCredentialsSchema,
  MoneyAmountSchema,
  RegisterCredentialsSchema,
} from "@fastifly/common";
import { getAuthRedirect } from "./auth/flow";
import { shouldShowSessionExpiredDialog } from "./auth/session-events";
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
  defaultDemoLogin: DEFAULT_DEMO_LOGIN,
  loginCredentialsSchema: LoginCredentialsSchema,
  moneySchema: MoneyAmountSchema,
  paginationQuerySchema: CursorPaginationQuerySchema,
  registerCredentialsSchema: RegisterCredentialsSchema,
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

export const webAuthFlowSmoke = {
  getAuthRedirect,
  shouldShowSessionExpiredDialog,
};
