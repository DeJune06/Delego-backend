import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";

export const healthHandler: RouteHandler = (_req, res) => {
  json(res, 200, {
    data: {
      status: "ok",
      service: "gateway",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
};
