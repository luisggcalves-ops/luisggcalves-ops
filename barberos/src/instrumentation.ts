import type { Instrumentation } from "next";
import { errorFields, logEvent, redactPath } from "@/server/log";

/** Every unhandled server error (pages, actions, route handlers) lands here as one structured log line. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  logEvent("error", "request_error", {
    ...errorFields(err),
    method: request.method,
    path: redactPath(request.path),
    route: context.routePath,
    routeType: context.routeType,
  });
};
