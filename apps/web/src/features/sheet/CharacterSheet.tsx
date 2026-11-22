import { usePartyMember } from '@/app';
import { Drawer, EmptyState } from '@/ui';

export interface CharacterSheetProps {
  /** The party member to show, such as `character-0001`, or `null` when the sheet is closed. */
  memberId: string | null;
  /** Closes the sheet. */
  onClose: () => void;
}

/**
 * One party member's sheet: abilities, saves, inventory, spells, and the member actions the user may take.
 * The shell renders it and opens it from `useTableUi().openCharacterSheet(memberId)`.
 */
export function CharacterSheet({ memberId, onClose }: CharacterSheetProps) {
  const member = usePartyMember(memberId);
  return (
    <Drawer
      open={memberId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={member?.name ?? 'Character sheet'}
      width="min(560px, 94vw)"
    >
      <EmptyState
        icon="scroll"
        title="Character sheet"
        description="The full sheet shows here: abilities, saving throws, inventory, spells, and actions."
      />
    </Drawer>
  );
}
