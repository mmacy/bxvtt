/**
 * A menu that opens at a point on the stage, such as where the user right-clicked the map. It uses the kit's
 * dropdown menu, anchored to an invisible button at that point, so it has the kit's keyboard behavior: arrow keys
 * move, type-ahead jumps, and Escape closes.
 */
import { DropdownMenu, type MenuEntry } from '@/ui';
import styles from './explore.module.css';

export interface PointMenuProps {
  /** Where the menu opens, in pixels from the stage's top-left corner, or `null` when it's closed. */
  at: { x: number; y: number } | null;
  items: MenuEntry[];
  /** The accessible name of the menu's anchor. */
  label: string;
  onClose: () => void;
  /** Called when focus lands on the hidden anchor, as it does when the menu closes, to move it somewhere useful. */
  onAnchorFocus?: () => void;
}

export function PointMenu({ at, items, label, onClose, onAnchorFocus }: PointMenuProps) {
  const open = at !== null && items.length > 0;
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="bottom"
      align="start"
      items={items}
      trigger={
        <button
          type="button"
          tabIndex={-1}
          aria-label={label}
          className={styles.menuAnchor}
          onFocus={onAnchorFocus}
          style={{ left: at?.x ?? 0, top: at?.y ?? 0 }}
        />
      }
    />
  );
}
