import {
  type AttachmentSummary,
  type ExpenseAttachmentListResponse,
  endpoints,
  Id,
  LinkExpenseAttachmentRequest,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param } from "@nestjs/common";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { ZodPipe } from "@/http/zod.pipe";
import { ExpenseAttachmentsService } from "./expense-attachments.service";

@Controller()
export class ExpenseAttachmentsController {
  private readonly expenseAttachments: ExpenseAttachmentsService;

  constructor(
    @Inject(ExpenseAttachmentsService)
    expenseAttachments: ExpenseAttachmentsService
  ) {
    this.expenseAttachments = expenseAttachments;
  }

  @HouseholdRoute(endpoints.listExpenseAttachments)
  listAttachments(
    @CurrentHousehold() household: HouseholdContext,
    @Param("expenseId", new ZodPipe(Id)) expenseId: Id
  ): Promise<ExpenseAttachmentListResponse> {
    return this.expenseAttachments.list(household.householdId, expenseId);
  }

  @HouseholdRoute(endpoints.linkExpenseAttachment, { module: "expenses" })
  linkAttachment(
    @CurrentHousehold() household: HouseholdContext,
    @Param("expenseId", new ZodPipe(Id)) expenseId: Id,
    @Body(new ZodPipe(LinkExpenseAttachmentRequest))
    body: LinkExpenseAttachmentRequest
  ): Promise<AttachmentSummary> {
    return this.expenseAttachments.link(household, expenseId, body);
  }

  @HouseholdRoute(endpoints.unlinkExpenseAttachment, { module: "expenses" })
  async unlinkAttachment(
    @CurrentHousehold() household: HouseholdContext,
    @Param("expenseId", new ZodPipe(Id)) expenseId: Id,
    @Param("attachmentId", new ZodPipe(Id)) attachmentId: Id
  ): Promise<void> {
    await this.expenseAttachments.unlink(household, expenseId, attachmentId);
  }
}
