import { ReceiptFailureCode } from "@homesplit/contracts";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from "@nestjs/common";
import { AiService } from "@/ai/ai.service";
import { attachmentInput } from "@/ai/ai-attachment";
import { AppError } from "@/http/app-error";
import { ObjectStorage } from "@/storage/object-storage";
import {
  ModelReceipt,
  SCAN_RECEIPT_INSTRUCTIONS,
  SCAN_RECEIPT_TASK,
  toReceiptDraft,
} from "./receipt-draft";
import {
  findExtractionSource,
  saveExtractedDraft,
  saveFailure,
} from "./receipts.repository";

/**
 * The code stored for a failed run: an AI error's or `NOT_A_RECEIPT`, both
 * thrown as `AppError`s with codes from `ReceiptFailureCode`. Anything else
 * is `null`, stored as `EXTRACTION_FAILED`.
 */
const failureCodeOf = (error: unknown): ReceiptFailureCode | null =>
  (error instanceof AppError &&
    ReceiptFailureCode.safeParse(error.code).data) ||
  null;

/**
 * Reads receipts in the background, in the API process, after the response.
 * Each run carries the receipt's `extraction_id` and writes only while it
 * still owns the receipt. Shutdown waits for the runs still going.
 */
@Injectable()
export class ReceiptExtraction implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptExtraction.name);
  private readonly ai: AiService;
  private readonly storage: ObjectStorage;
  /** Runs still going, which shutdown waits for. */
  private readonly running = new Set<Promise<void>>();

  constructor(
    @Inject(AiService) ai: AiService,
    @Inject(ObjectStorage) storage: ObjectStorage
  ) {
    this.ai = ai;
    this.storage = storage;
  }

  /** Starts a run; errors end as a `failed` receipt, never a rejection. */
  start(receiptId: string, extractionId: string): void {
    const run: Promise<void> = this.extract(receiptId, extractionId)
      .catch((error: unknown) => {
        this.logger.error(`Receipt ${receiptId} extraction: ${String(error)}`);
      })
      .finally(() => {
        this.running.delete(run);
      });
    this.running.add(run);
  }

  /** Resolves once every run started so far has finished. */
  async idle(): Promise<void> {
    await Promise.allSettled(this.running);
  }

  onModuleDestroy(): Promise<void> {
    return this.idle();
  }

  private async extract(
    receiptId: string,
    extractionId: string
  ): Promise<void> {
    try {
      const source = await findExtractionSource(receiptId, extractionId);
      if (!source) {
        return;
      }
      const content = await this.storage.get(source.storageKey);
      const file = await attachmentInput(content, source.mimeType);
      const reply = await this.ai.generate(source.householdId, {
        task: SCAN_RECEIPT_TASK,
        instructions: SCAN_RECEIPT_INSTRUCTIONS,
        input: [{ type: "text", text: "Read this receipt." }, file],
        output: ModelReceipt,
      });
      await saveExtractedDraft(receiptId, extractionId, toReceiptDraft(reply));
    } catch (error) {
      const code = failureCodeOf(error);
      if (code === null) {
        this.logger.error(`Receipt ${receiptId} extraction: ${String(error)}`);
      }
      await saveFailure(receiptId, extractionId, code ?? "EXTRACTION_FAILED");
    }
  }
}
