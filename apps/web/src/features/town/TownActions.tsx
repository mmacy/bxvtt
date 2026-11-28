import { useState } from 'react';
import { formatShortcut, useAction, useShortcut } from '@/app';
import { ActionBarDivider, ActionBarItem, ActionBarMenu, Button, type IconName, type MenuEntry } from '@/ui';
import { useLeaveAccess, usePartyAccess, useTownServices } from './hooks';
import { useRest } from './RestAndPrepare';
import { useTownUi, type TownSection } from './townUi';
import styles from './TownActions.module.css';

interface Destination {
  id: string;
  section: TownSection;
  keys: string;
  label: string;
  icon: IconName;
  enabled: boolean;
  /** What the button's tooltip says it does. */
  tooltip: string;
  /** Why the button is unavailable, or `null` while it is available. */
  reason: string | null;
}

/** Registers the shortcut that opens one part of town. */
function usePlaceShortcut(place: Destination, active: boolean) {
  useShortcut({
    id: `town.${place.id}`,
    keys: place.keys,
    label: `Go to ${place.label.toLowerCase()}`,
    group: 'Town',
    enabled: place.enabled && active,
    run: () => {
      useTownUi.getState().setSection(place.section);
    },
  });
}

/**
 * The action bar in `town` mode: the outfitter, the temple, the treasure buyers, rest, and setting out. Each has a
 * shortcut and a palette action, and each is enabled only when its command is legal and the viewer may send it.
 */
export function TownActions() {
  const services = useTownServices();
  const access = useLeaveAccess();
  const section = useTownUi((s) => s.section);
  const setSection = useTownUi((s) => s.setSection);
  const leaveOpen = useTownUi((s) => s.leaveOpen);
  const setLeaveOpen = useTownUi((s) => s.setLeaveOpen);
  const { rest, pending } = useRest();

  const canLeave = services.leave && access.allowed;
  const outfitter: Destination = {
    id: 'outfitter',
    section: 'outfitter',
    keys: 'o',
    label: 'Outfitter',
    icon: 'chest',
    enabled: services.outfitter,
    tooltip: 'Go to the outfitter to buy weapons, armour, and gear',
    reason: services.reasons.outfitter,
  };
  const temple: Destination = {
    id: 'temple',
    section: 'temple',
    keys: 't',
    label: 'Temple',
    icon: 'heart',
    enabled: services.temple,
    tooltip: 'Go to the temple to buy healing and cures',
    reason: services.reasons.temple,
  };
  const treasure: Destination = {
    id: 'treasure',
    section: 'treasure',
    keys: 'm',
    label: 'Treasure buyers',
    icon: 'gem',
    enabled: services.treasure,
    tooltip: 'Go to the treasure buyers to sell gems and jewellery',
    reason: services.reasons.treasure,
  };

  const shortcutsOn = !leaveOpen;
  usePlaceShortcut(outfitter, shortcutsOn);
  usePlaceShortcut(temple, shortcutsOn);
  usePlaceShortcut(treasure, shortcutsOn);
  const restAccess = usePartyAccess('rest');
  const [restOpen, setRestOpen] = useState(false);
  useShortcut({
    id: 'town.rest',
    keys: 'shift+r',
    label: 'Rest or prepare',
    group: 'Town',
    enabled: services.rest && shortcutsOn,
    run: () => setRestOpen(true),
  });
  useShortcut({
    id: 'town.leave',
    keys: 'g',
    label: 'Set out for the dungeon',
    group: 'Town',
    enabled: canLeave && shortcutsOn,
    run: () => setLeaveOpen(true),
  });
  useAction({
    id: 'town.leave',
    label: 'Set out for the dungeon',
    group: 'Town',
    icon: 'door',
    shortcut: 'g',
    disabled: !canLeave,
    disabledReason: canLeave ? null : access.explanation,
    run: () => setLeaveOpen(true),
  });
  useAction({
    id: 'town.rest.night',
    label: 'Rest for a night',
    group: 'Town',
    icon: 'moon',
    disabled: !restAccess.allowed || !services.rest || pending,
    disabledReason: restAccess.explanation || services.reasons.rest,
    keywords: ['sleep', 'camp'],
    run: () => {
      setSection('rest');
      void rest('night');
    },
  });
  useAction({
    id: 'town.rest.day',
    label: 'Rest for a full day',
    group: 'Town',
    icon: 'sun',
    disabled: !restAccess.allowed || !services.rest || pending,
    disabledReason: restAccess.explanation || services.reasons.rest,
    keywords: ['heal', 'camp'],
    run: () => {
      setSection('rest');
      void rest('day');
    },
  });

  const restNow = (kind: string) => {
    setSection('rest');
    void rest(kind);
  };
  const restItems: MenuEntry[] = [
    {
      label: 'Rest for one turn',
      icon: 'hourglass',
      disabled: !restAccess.allowed || pending,
      disabledReason: restAccess.allowed ? null : restAccess.explanation,
      onSelect: () => restNow('turn'),
    },
    {
      label: 'Rest for a night',
      icon: 'moon',
      disabled: !restAccess.allowed || pending,
      disabledReason: restAccess.allowed ? null : restAccess.explanation,
      onSelect: () => restNow('night'),
    },
    {
      label: 'Rest for a full day',
      icon: 'sun',
      disabled: !restAccess.allowed || pending,
      disabledReason: restAccess.allowed ? null : restAccess.explanation,
      onSelect: () => restNow('day'),
    },
    { type: 'separator' },
    { label: 'Open rest and prepare', icon: 'rest', onSelect: () => setSection('rest') },
  ];

  const button = (place: Destination) => (
    <ActionBarItem key={place.id}>
      <Button
        variant="secondary"
        icon={place.icon}
        disabled={!place.enabled}
        disabledReason={place.reason}
        tooltip={place.tooltip}
        shortcut={formatShortcut(place.keys)}
        onClick={() => setSection(place.section)}
        className={section === place.section ? styles.here : undefined}
      >
        {place.label}
      </Button>
    </ActionBarItem>
  );

  return (
    <>
      {button(outfitter)}
      {button(temple)}
      {button(treasure)}
      <ActionBarDivider />
      <ActionBarMenu
        label="Rest"
        icon="rest"
        shortcut={['Shift', 'R']}
        items={restItems}
        tooltip="Rest the party for a turn, a night, or a full day"
        disabled={!services.rest}
        disabledReason={services.reasons.rest}
        open={restOpen}
        onOpenChange={setRestOpen}
      />
      <ActionBarDivider />
      <ActionBarItem>
        <Button
          variant="primary"
          icon="door"
          disabled={!canLeave}
          disabledReason={canLeave ? null : access.explanation}
          tooltip="Lead the party out of town to a dungeon"
          shortcut="G"
          onClick={() => setLeaveOpen(true)}
        >
          Set out
        </Button>
      </ActionBarItem>
    </>
  );
}
