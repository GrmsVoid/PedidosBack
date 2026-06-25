import { beforeAll, afterAll } from "vitest";

beforeAll(() => {
  process.env.APP_TIMEZONE = "America/Lima";
});

afterAll(() => {
  // intencionalmente vacío; cada suite limpia lo suyo
});
