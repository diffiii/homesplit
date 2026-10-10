import type { Endpoint } from "@homesplit/contracts";
import {
  applyDecorators,
  HttpCode,
  RequestMapping,
  RequestMethod,
} from "@nestjs/common";

/**
 * Map a handler to an endpoint from the contracts map.
 * `path` is the full public path (including `/api`); use it on a `@Controller()`
 * without a prefix, and do not add a Nest global prefix on top.
 */
export const Route = ({ method, path, status }: Endpoint) =>
  applyDecorators(
    RequestMapping({ method: RequestMethod[method], path }),
    HttpCode(status)
  );
