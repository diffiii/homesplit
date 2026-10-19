import { user } from "@/db/schema";

export const userSummaryColumns = {
  id: user.id,
  name: user.name,
  imageUrl: user.image,
};
