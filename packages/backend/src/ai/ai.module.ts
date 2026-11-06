import { Module } from "@nestjs/common";
import { aiConfig } from "./ai.config";
import { AiService } from "./ai.service";
import { AiClient } from "./ai-client";
import { FakeAiClient } from "./fake-ai-client";
import { OpenAiCompatibleAiClient } from "./openai-compatible-ai-client";

@Module({
  providers: [
    {
      provide: AiClient,
      useFactory: (): AiClient | null => {
        if (aiConfig.fake) {
          return new FakeAiClient();
        }
        return aiConfig.provider
          ? new OpenAiCompatibleAiClient(aiConfig.provider)
          : null;
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
