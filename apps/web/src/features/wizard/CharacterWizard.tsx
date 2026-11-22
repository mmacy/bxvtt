import type { StoredCharacter } from '@bxvtt/shared/protocol';
import { Button, Dialog, EmptyState } from '@/ui';

export interface CharacterWizardProps {
  /** Whether the wizard is open. */
  open: boolean;
  /** Closes the wizard without creating a character. */
  onClose: () => void;
  /**
   * Called once bxapi has stored the new character (`POST /api/characters`). The lobby adds it to the roster,
   * and the home page refreshes the character list. Call `onClose` yourself after it, or keep the wizard open
   * to make another.
   */
  onCreated: (character: StoredCharacter) => void;
}

/** The character wizard: rolls abilities, picks a class and gear, and stores a character for the user. */
export function CharacterWizard({ open, onClose }: CharacterWizardProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Create a character"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <EmptyState
        icon="user"
        title="Character wizard"
        description="The character wizard isn't built yet. It will roll ability scores, help you pick a class, and buy starting gear."
      />
    </Dialog>
  );
}
