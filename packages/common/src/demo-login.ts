export const DEMO_LOGIN_CREDENTIALS = {
  owner: {
    password: "password",
    username: "owner",
  },
  partner: {
    password: "password",
    username: "partner",
  },
} as const;

export const DEFAULT_DEMO_LOGIN = DEMO_LOGIN_CREDENTIALS.owner;
