import {
  AuthCredentialsSchema,
  ChangePasswordRequestSchema,
  CursorPaginationQuerySchema,
  DEFAULT_DEMO_LOGIN,
  FinishPasskeyLoginRequestSchema,
  FinishPasskeyRegistrationRequestSchema,
  LoginCredentialsSchema,
  MoneyAmountSchema,
  RegisterCredentialsSchema,
  RenamePasskeyRequestSchema,
  StartPasskeyLoginRequestSchema,
  StartPasskeyRegistrationRequestSchema,
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
  changePasswordRequestSchema: ChangePasswordRequestSchema,
  defaultDemoLogin: DEFAULT_DEMO_LOGIN,
  finishPasskeyLoginRequestSchema: FinishPasskeyLoginRequestSchema,
  finishPasskeyRegistrationRequestSchema: FinishPasskeyRegistrationRequestSchema,
  loginCredentialsSchema: LoginCredentialsSchema,
  moneySchema: MoneyAmountSchema,
  paginationQuerySchema: CursorPaginationQuerySchema,
  renamePasskeyRequestSchema: RenamePasskeyRequestSchema,
  registerCredentialsSchema: RegisterCredentialsSchema,
  startPasskeyLoginRequestSchema: StartPasskeyLoginRequestSchema,
  startPasskeyRegistrationRequestSchema: StartPasskeyRegistrationRequestSchema,
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
