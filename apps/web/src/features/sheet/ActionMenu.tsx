import { useState } from 'react';
import { Button, IconButton, Popover, type IconName } from '@/ui';
import styles from './sheet.module.css';

/** One action in an {@link ActionMenu}. */
export interface ActionMenuItem {
  label: string;
  icon?: IconName;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * A row's actions in a small popover of buttons. The kit's dropdown menu opens beneath a drawer, so the sheet,
 * which lives in a drawer, uses a popover instead.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="200px"
      trigger={<IconButton icon="more-vertical" label={label} variant="ghost" size="sm" />}
    >
      <div className={styles.actionMenu} role="group" aria-label={label}>
        {items.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            size="sm"
            icon={item.icon}
            disabled={item.disabled}
            className={styles.actionItem}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </Popover>
  );
}
