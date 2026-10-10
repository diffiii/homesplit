import type { INestApplication } from "@nestjs/common";
import { ApiExceptionFilter } from "./http/api-exception.filter";

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiExceptionFilter());
}
