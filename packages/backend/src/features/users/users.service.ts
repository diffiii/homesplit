import type { UpdateProfileRequest, UserSummary } from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { userSummaryColumns } from "./user-projections";

@Injectable()
export class UsersService {
  async updateProfile(
    userId: string,
    { name, imageUrl }: UpdateProfileRequest
  ): Promise<UserSummary> {
    const [row] = await db
      .update(user)
      .set({ name, image: imageUrl })
      .where(eq(user.id, userId))
      .returning(userSummaryColumns);
    return row;
  }
}
