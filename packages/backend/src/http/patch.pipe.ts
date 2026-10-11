import type { ArgumentMetadata } from "@nestjs/common";
import type { z } from "zod";
import { emptyPatch } from "./app-error";
import { ZodPipe } from "./zod.pipe";

export class PatchPipe<T extends z.ZodObject> extends ZodPipe<T> {
  override transform(value: unknown, metadata: ArgumentMetadata): z.output<T> {
    const parsed = super.transform(value, metadata);
    if (Object.keys(parsed).length === 0) {
      throw emptyPatch();
    }
    return parsed;
  }
}
