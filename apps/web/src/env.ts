export const API_BASE_URL = import.meta.env.VITE_FASTIFLY_API_BASE_URL?.replace(/\/$/, "") ?? "";

const demoLoginFlag = import.meta.env.VITE_FASTIFLY_SHOW_DEMO_LOGIN?.trim().toLowerCase();

export const SHOW_DEMO_LOGIN =
  import.meta.env.DEV || demoLoginFlag === "1" || demoLoginFlag === "true";
