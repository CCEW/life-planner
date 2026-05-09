import { z } from "zod";

export const StudentSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  major: z.string(),
});

export type StudentInput = z.infer<typeof StudentSchema>;