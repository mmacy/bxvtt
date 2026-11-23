/**
 * Whether a referee command can be sent now, and if it can't, the sentence that says why. The reason comes from
 * the permission helpers in `@/app`, which build it from the `allowed_modes` that bxapi's command catalog states,
 * so this client never lists the modes of a command itself.
 */
import { useCanSend, useCommandCatalog } from '@/app';

export interface CommandReason {
  /** Whether the command is legal now. */
  available: boolean;
  /**
   * Why it isn't, such as "You can spawn an NPC party only while exploring. The party is in town now." It is
   * `null` while the command is available and while the catalog is still loading, so a control stays disabled
   * without a reason for that moment.
   */
  reason: string | null;
}

/**
 * Reads whether a referee command is legal now, with the reason to show beside a disabled control.
 *
 * @param commandType - The command, such as `spawn_monsters`.
 */
export function useCommandReason(commandType: string): CommandReason {
  const permission = useCanSend(commandType);
  const catalog = useCommandCatalog();
  if (permission.allowed) return { available: true, reason: null };
  return { available: false, reason: catalog.data ? permission.reason : null };
}
