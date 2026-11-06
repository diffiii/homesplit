import type { Endpoint } from "@homesplit/contracts";
import { Body, Controller, Inject, Module } from "@nestjs/common";
import { z } from "zod";
import { AiModule } from "@/ai/ai.module";
import { AiService } from "@/ai/ai.service";
import { AppModule } from "@/app.module";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { ZodPipe } from "@/http/zod.pipe";

export const AI_PROBE_TASK = "probe";

export const aiProbePath = (householdId: string): string =>
  `/api/households/${householdId}/probe/ai`;

const endpoint: Endpoint = {
  method: "POST",
  path: "/api/households/:householdId/probe/ai",
  status: 200,
  response: z.unknown(),
};

const ProbeRequest = z.object({ text: z.string().min(1) });
type ProbeRequest = z.output<typeof ProbeRequest>;

export const ProbeReply = z.object({ answer: z.string() });

/** A test-only AI feature: one `AiService` call per request. */
@Controller()
class AiProbeController {
  private readonly ai: AiService;

  constructor(@Inject(AiService) ai: AiService) {
    this.ai = ai;
  }

  @HouseholdRoute(endpoint)
  ask(
    @CurrentHousehold() { householdId }: HouseholdContext,
    @Body(new ZodPipe(ProbeRequest)) body: ProbeRequest
  ) {
    return this.ai.generate(householdId, {
      task: AI_PROBE_TASK,
      instructions: "Answer the question.",
      input: [{ type: "text", text: body.text }],
      output: ProbeReply,
    });
  }
}

@Module({
  imports: [AppModule, AiModule],
  controllers: [AiProbeController],
})
export class AiProbeModule {}
