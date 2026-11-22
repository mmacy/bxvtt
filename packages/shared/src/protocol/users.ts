import { z } from 'zod';
import { LIMITS, Timestamp, UserColor, UserId, displayString } from './common';

/** A person at a table, as every member of a shared table sees them. */
export const User = z.object({
  id: UserId,
  name: z.string(),
  color: UserColor,
  created_at: Timestamp,
});
/** A person at a table. */
export type User = z.infer<typeof User>;

/** Body of `POST /api/users`: create a user with a display name. The server picks the color. */
export const CreateUserRequest = z.strictObject({
  name: displayString(LIMITS.userName),
});
/** Body of `POST /api/users`. */
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

/**
 * Response of `POST /api/users`: the new user and the secret token the browser stores. The server shows the
 * token only here. Send it as `Authorization: Bearer <token>` on every request and in the WebSocket `auth`
 * message.
 */
export const CreateUserResponse = z.object({
  user: User,
  token: z.string(),
});
/** Response of `POST /api/users`. */
export type CreateUserResponse = z.infer<typeof CreateUserResponse>;

/** Body of `PATCH /api/users/me`: change the display name, the color, or both. */
export const UpdateUserRequest = z
  .strictObject({
    name: displayString(LIMITS.userName).optional(),
    color: UserColor.optional(),
  })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: 'set name, color, or both',
  });
/** Body of `PATCH /api/users/me`. */
export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;
