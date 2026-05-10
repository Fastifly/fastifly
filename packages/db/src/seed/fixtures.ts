export const SEED_CREDENTIALS = {
  owner: {
    password: "fastifly-demo-password",
    username: "demo-owner",
  },
  partner: {
    password: "fastifly-demo-password",
    username: "demo-partner",
  },
} as const;

export const SEED_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$8gE7KrFBGVuVPzrS2pA0xQ$JHSIYcPutP8hffrloN+6eoQ60rj/gFODCmnIJ6wXcEc";

export const SEED_NOW = "2026-05-10T00:00:00.000Z";
