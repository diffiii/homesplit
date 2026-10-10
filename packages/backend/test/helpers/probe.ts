import { randomUUID } from "node:crypto";
import { Id, Pagination, queryBoolean } from "@homesplit/contracts";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { z } from "zod";
import { AppModule } from "../../src/app.module";
import { db } from "../../src/db";
import { user } from "../../src/db/schema";
import { ZodPipe } from "../../src/http/zod.pipe";

export const ProbeQuery = Pagination.extend({
  archived: queryBoolean().optional(),
});

export const ProbeBody = z.object({
  name: z.string().min(1),
  amount: z.int(),
});

/** Test-only routes that exercise validation and errors. */
@Controller("probe")
@AllowAnonymous()
class ProbeController {
  @Get()
  list(@Query(new ZodPipe(ProbeQuery)) query: z.output<typeof ProbeQuery>) {
    return query;
  }

  @Post()
  create(@Body(new ZodPipe(ProbeBody)) body: z.output<typeof ProbeBody>) {
    return body;
  }

  @Get("boom")
  boom(): never {
    throw new Error("secret internal detail");
  }

  @Get("forbidden")
  forbidden(): never {
    throw new ForbiddenException();
  }

  @Post("duplicate-user")
  async duplicateUser(): Promise<void> {
    const email = `dup-${randomUUID()}@test.local`;
    const row = { email, emailVerified: false, name: "Dup" };
    await db.insert(user).values({ ...row, id: randomUUID() });
    await db.insert(user).values({ ...row, id: randomUUID() });
  }

  @Get(":id")
  byId(@Param("id", new ZodPipe(Id)) id: Id) {
    return { id };
  }
}

/** Route that keeps the global auth guard. */
@Controller("probe-private")
class ProbePrivateController {
  @Get()
  get() {
    return { ok: true };
  }
}

@Module({
  imports: [AppModule],
  controllers: [ProbeController, ProbePrivateController],
})
export class ProbeModule {}
