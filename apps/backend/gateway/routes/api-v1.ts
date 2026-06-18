import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";

/** Placeholder API v1 status endpoint */
export const apiV1Handler: RouteHandler = (_req, res) => {
  json(res, 200, {
    data: {
      api: "v1",
      message: "Delego API — endpoints coming soon",
    },
    error: null,
  });
};
