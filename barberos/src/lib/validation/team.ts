import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  role: z.enum(["manager", "barber"]),
});

export type InviteInput = z.input<typeof inviteSchema>;

export const changeRoleSchema = z.object({
  membershipId: z.uuid(),
  role: z.enum(["manager", "barber"]),
});
