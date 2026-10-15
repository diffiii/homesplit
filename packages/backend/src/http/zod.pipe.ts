import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { AppError } from "./app-error";

export class ZodPipe<T extends z.ZodType>
  implements PipeTransform<unknown, z.output<T>>
{
  private readonly schema: T;

  constructor(schema: T) {
    this.schema = schema;
  }

  transform(value: unknown, { data }: ArgumentMetadata): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const prefix = data ? [data] : [];
      const issues = result.error.issues.map(({ path, message }) => ({
        path: [...prefix, ...path],
        message,
      }));
      throw new AppError(400, "VALIDATION_ERROR", "Invalid request", {
        issues,
      });
    }
    return result.data;
  }
}
