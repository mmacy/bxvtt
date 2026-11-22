import type { MemberView } from '@bxvtt/shared/bxapi';
import { capitalizeFirst, groupName } from '@bxvtt/shared/text';
import { useMemo, useState, type ReactNode } from 'react';
import {
  useEncounter,
  useParty,
  usePlayerView,
  useScene,
  useSendCommand,
  useSpellCatalog,
  useTextContext,
  type CompendiumEntry,
} from '@/app';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Combobox,
  CoinPurse,
  ConditionChip,
  Dialog,
  DropdownMenu,
  IconButton,
  Field,
  Icon,
  NumberInput,
  Select,
  cx,
  type MenuEntry,
} from '@/ui';
import { effectLabel, effectRemaining, useMemberCommand } from './actions';
import { ItemDetailButton } from './ItemDetail';
import { RuleLink } from './RuleLink';
import { equippedEntries, type InventoryEntry, type Purse, type SheetModel } from './model';
import styles from './sheet.module.css';
import { useSpellDetail } from './catalogs';

const COINS: Array<keyof Purse> = ['pp', 'gp', 'ep', 'sp', 'cp'];
const COIN_NAMES: Record<keyof Purse, string> = {
  pp: 'Platinum',
  gp: 'Gold',
  ep: 'Electrum',
  sp: 'Silver',
  cp: 'Copper',
};

const LIGHT_SOURCES = new Set(['torch', 'lantern']);

/** Whether to offer "Equip" for a pack entry. The server decides whether the member may. */
function offersEquip(entry: InventoryEntry): boolean {
  if (entry.kind === 'magic') return true;
  if (entry.kind !== 'item') return false;
  return entry.itemType === 'weapon' || entry.itemType === 'armour';
}

function entryFacts(entry: InventoryEntry): string | null {
  const t = entry.template;
  if (entry.kind === 'valuable')
    return entry.valueGp !== null ? `${entry.valueGp.toLocaleString('en-US')} gp` : null;
  if (!t) return null;
  const combat =
    typeof t.combat === 'object' && t.combat !== null ? (t.combat as Record<string, unknown>) : t;
  if (t.item_type === 'weapon' && typeof combat.damage === 'string') return combat.damage;
  if (typeof t.ac === 'number') return `AC ${t.ac}`;
  if (typeof t.ac_bonus === 'number') return `AC +${t.ac_bonus}`;
  return null;
}

/** The rules entry an inventory entry opens. An unidentified magic item opens nothing, so it stays a mystery. */
export function entryRule(entry: InventoryEntry): CompendiumEntry | null {
  if (entry.catalogId === null || !entry.identified) return null;
  if (entry.kind === 'item') return { kind: 'equipment', id: entry.catalogId };
  if (entry.kind === 'magic') return { kind: 'magic-items', id: entry.catalogId };
  return null;
}

function EntryName({ entry, link = false }: { entry: InventoryEntry; link?: boolean }) {
  const className = cx(styles.itemName, entry.kind === 'magic' && !entry.identified && styles.masked);
  return (
    <span className={styles.itemMain}>
      {link ? (
        <RuleLink entry={entryRule(entry)} className={className}>
          {entry.name}
        </RuleLink>
      ) : (
        <span className={className}>{entry.name}</span>
      )}
      {entry.kind === 'magic' && (
        <Badge tone="magic" appearance="outline">
          {entry.identified ? 'Magic' : 'Unidentified'}
        </Badge>
      )}
      {entry.cursed && <Badge tone="danger">Cursed</Badge>}
      {entryFacts(entry) && <span className={styles.itemFacts}>{entryFacts(entry)}</span>}
    </span>
  );
}

interface TabProps {
  member: MemberView;
  model: SheetModel;
}

/**
 * The inventory tab: what the member wears and wields, the pack, valuables, and the purse, with every member
 * action bxapi offers in this mode.
 */
export function InventoryTab({ member, model }: TabProps) {
  const inventory = model.inventory;
  const { send, pending } = useSendCommand();
  const equip = useMemberCommand('equip_item', member.id);
  const unequip = useMemberCommand('unequip_item', member.id);
  const give = useMemberCommand('give_items', member.id);
  const drop = useMemberCommand('drop_items', member.id);
  const use = useMemberCommand('use_item', member.id);
  const light = useMemberCommand('light_source', member.id);
  const extinguish = useMemberCommand('extinguish_source', member.id);
  const view = usePlayerView();
  const scene = useScene();
  const [transfer, setTransfer] = useState<{ mode: 'give' | 'drop'; entryKey: string | null } | null>(null);
  const [using, setUsing] = useState<InventoryEntry | null>(null);

  const lights = (view?.effects ?? []).filter((e) => e.character_id === member.id && e.kind === 'light');
  const anyAction = [equip, unequip, give, drop, use, light, extinguish].some((c) => c.legal !== null);
  const blocked = [equip, unequip, give, drop, use, light, extinguish].find(
    (c) => c.legal !== null && !c.permission.allowed,
  );
  const reason = blocked && !blocked.permission.allowed ? blocked.permission.reason : null;

  const menuFor = (entry: InventoryEntry): MenuEntry[] => {
    const items: MenuEntry[] = [];
    if (equip.legal && offersEquip(entry))
      items.push({
        label: 'Equip',
        icon: 'shield',
        disabled: !equip.permission.allowed || pending,
        onSelect: () =>
          void send({ command_type: 'equip_item', character_id: member.id, item_id: entry.commandId }),
      });
    if (use.legal && entry.kind === 'magic')
      items.push({
        label: 'Use',
        icon: 'spell',
        disabled: !use.permission.allowed,
        onSelect: () => setUsing(entry),
      });
    if (light.legal && entry.kind === 'item' && LIGHT_SOURCES.has(entry.commandId))
      items.push({
        label: entry.commandId === 'torch' ? 'Light a torch' : 'Light the lantern',
        icon: entry.commandId === 'torch' ? 'torch' : 'lantern',
        disabled: !light.permission.allowed || pending,
        onSelect: () =>
          void send({ command_type: 'light_source', character_id: member.id, item_id: entry.commandId }),
      });
    if (give.legal)
      items.push({
        label: 'Give to…',
        icon: 'hand',
        disabled: !give.permission.allowed,
        onSelect: () => setTransfer({ mode: 'give', entryKey: entry.key }),
      });
    if (drop.legal)
      items.push({
        label: 'Drop…',
        icon: 'arrow-down',
        disabled: !drop.permission.allowed,
        onSelect: () => setTransfer({ mode: 'drop', entryKey: entry.key }),
      });
    return items;
  };

  const row = (entry: InventoryEntry, trailing?: ReactNode) => {
    const menu = entry.slot === 'pack' ? menuFor(entry) : [];
    return (
      <li key={entry.key} className={styles.itemRow}>
        <EntryName entry={entry} link />
        <span className={styles.itemActions}>
          <ItemDetailButton entry={entry} />
          {trailing}
          {menu.length > 0 && (
            <DropdownMenu
              align="end"
              items={menu}
              trigger={
                <IconButton
                  icon="more-vertical"
                  label={`Actions for ${entry.name}`}
                  variant="ghost"
                  size="sm"
                />
              }
            />
          )}
        </span>
      </li>
    );
  };

  const unequipButton = (entry: InventoryEntry) =>
    unequip.legal ? (
      <Button
        size="sm"
        variant="ghost"
        disabled={!unequip.permission.allowed || pending}
        title={unequip.permission.reason ?? undefined}
        onClick={() =>
          void send({ command_type: 'unequip_item', character_id: member.id, item_id: entry.commandId })
        }
      >
        Unequip
      </Button>
    ) : null;

  const slot = (label: string, entries: InventoryEntry[], empty: string) => (
    <div className={styles.slot}>
      <span className={styles.slotLabel}>{label}</span>
      {entries.length === 0 ? (
        <span className={styles.slotEmpty}>{empty}</span>
      ) : (
        <ul className={styles.items}>{entries.map((entry) => row(entry, unequipButton(entry)))}</ul>
      )}
    </div>
  );

  return (
    <div className={styles.tabPanel}>
      {anyAction && reason && (
        <Banner tone="neutral" icon="lock">
          {reason}
        </Banner>
      )}

      <section className={styles.section} aria-labelledby="inv-worn">
        <h3 id="inv-worn" className={styles.sectionTitle}>
          Worn and wielded
        </h3>
        <div className={styles.slots}>
          {slot('Armour', inventory.armour ? [inventory.armour] : [], 'No armour')}
          {slot('Shield', inventory.shield ? [inventory.shield] : [], 'No shield')}
          {slot('Wielded', inventory.wielded, 'Empty hands')}
          {slot('Rings', inventory.rings, 'No rings')}
        </div>
      </section>

      {(lights.length > 0 || extinguish.legal || light.legal) && (
        <section className={styles.section} aria-labelledby="inv-light">
          <h3 id="inv-light" className={styles.sectionTitle}>
            Light
          </h3>
          <div className={styles.lightRow}>
            {lights.length === 0 ? (
              <span className={styles.muted}>{member.name} carries no light.</span>
            ) : (
              lights.map((effect, index) => (
                <ConditionChip
                  key={`${effect.kind}-${index}`}
                  label={effectLabel(effect.kind)}
                  tone="boon"
                  icon="torch"
                  duration={effectRemaining(effect.remaining_rounds)}
                />
              ))
            )}
            {light.legal &&
              inventory.pack
                .filter((entry) => entry.kind === 'item' && LIGHT_SOURCES.has(entry.commandId))
                .map((entry) => (
                  <Button
                    key={entry.key}
                    size="sm"
                    variant="secondary"
                    icon={entry.commandId === 'torch' ? 'torch' : 'lantern'}
                    disabled={!light.permission.allowed || pending}
                    title={light.permission.reason ?? undefined}
                    onClick={() =>
                      void send({
                        command_type: 'light_source',
                        character_id: member.id,
                        item_id: entry.commandId,
                      })
                    }
                  >
                    {entry.commandId === 'torch' ? 'Light a torch' : 'Light the lantern'}
                  </Button>
                ))}
            {extinguish.legal && lights.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon="close"
                disabled={!extinguish.permission.allowed || pending}
                title={extinguish.permission.reason ?? undefined}
                onClick={() => void send({ command_type: 'extinguish_source', character_id: member.id })}
              >
                Put out the torch or lantern
              </Button>
            )}
            {light.legal && scene?.here?.pile && (
              <Button
                size="sm"
                variant="ghost"
                icon="torch"
                disabled={!light.permission.allowed || pending}
                title={light.permission.reason ?? undefined}
                onClick={() =>
                  void send({ command_type: 'light_source', character_id: member.id, item_id: 'oil_flask' })
                }
              >
                Set fire to dropped oil
              </Button>
            )}
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="inv-pack">
        <div className={styles.sectionHeader}>
          <h3 id="inv-pack" className={styles.sectionTitle}>
            Pack
          </h3>
          <span className={styles.itemActions}>
            {give.legal && (
              <Button
                size="sm"
                variant="secondary"
                icon="hand"
                disabled={!give.permission.allowed}
                title={give.permission.reason ?? undefined}
                onClick={() => setTransfer({ mode: 'give', entryKey: null })}
              >
                Give
              </Button>
            )}
            {drop.legal && (
              <Button
                size="sm"
                variant="ghost"
                icon="arrow-down"
                disabled={!drop.permission.allowed}
                title={drop.permission.reason ?? undefined}
                onClick={() => setTransfer({ mode: 'drop', entryKey: null })}
              >
                Drop
              </Button>
            )}
          </span>
        </div>
        {inventory.pack.length === 0 ? (
          <p className={styles.muted}>The pack is empty.</p>
        ) : (
          <ul className={styles.items}>{inventory.pack.map((entry) => row(entry))}</ul>
        )}
      </section>

      {inventory.valuables.length > 0 && (
        <section className={styles.section} aria-labelledby="inv-valuables">
          <h3 id="inv-valuables" className={styles.sectionTitle}>
            Gems and jewellery
          </h3>
          <ul className={styles.items}>{inventory.valuables.map((entry) => row(entry))}</ul>
        </section>
      )}

      <section className={styles.section} aria-labelledby="inv-purse">
        <h3 id="inv-purse" className={styles.sectionTitle}>
          Purse
        </h3>
        <CoinPurse coins={inventory.purse} />
      </section>

      {transfer && (
        <TransferDialog
          mode={transfer.mode}
          member={member}
          model={model}
          initialKey={transfer.entryKey}
          onClose={() => setTransfer(null)}
        />
      )}
      {using && <UseItemDialog member={member} entry={using} onClose={() => setUsing(null)} />}
    </div>
  );
}

interface TransferProps {
  mode: 'give' | 'drop';
  member: MemberView;
  model: SheetModel;
  initialKey: string | null;
  onClose: () => void;
}

/** Gives items and coins to another member, or drops them on the party's cell. */
function TransferDialog({ mode, member, model, initialKey, onClose }: TransferProps) {
  const party = useParty();
  const { send, pending } = useSendCommand();
  const recipients = party.filter((m) => m.id !== member.id);
  const [recipient, setRecipient] = useState<string>(recipients[0]?.id ?? '');
  const entries = useMemo(
    () => [
      ...model.inventory.pack,
      ...model.inventory.valuables,
      ...equippedEntries(model.inventory).filter((e) => e.kind === 'magic'),
    ],
    [model.inventory],
  );
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const first = entries.find((e) => e.key === initialKey);
    return first ? { [first.key]: 1 } : {};
  });
  const [coins, setCoins] = useState<Purse>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  const [error, setError] = useState<string | null>(null);

  const itemIds = entries.flatMap((entry) =>
    Array.from({ length: Math.min(counts[entry.key] ?? 0, entry.quantity) }, () => entry.commandId),
  );
  const coinTotal = COINS.reduce((sum, c) => sum + coins[c], 0);
  const nothing = itemIds.length === 0 && coinTotal === 0;
  const title = mode === 'give' ? `Give from ${member.name}'s pack` : `Drop from ${member.name}'s pack`;

  const submit = async () => {
    setError(null);
    const coinBody = Object.fromEntries(COINS.filter((c) => coins[c] > 0).map((c) => [c, coins[c]]));
    const command =
      mode === 'give'
        ? {
            command_type: 'give_items',
            character_id: member.id,
            recipient_id: recipient,
            item_ids: itemIds,
            coins: coinBody,
          }
        : { command_type: 'drop_items', character_id: member.id, item_ids: itemIds, coins: coinBody };
    const result = await send(command, { display: 'inline' });
    if (result.status === 'accepted') onClose();
    else if (result.status === 'refused' || result.status === 'error' || result.status === 'skipped')
      setError(result.message);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={
        mode === 'give'
          ? 'Choose what to hand over. Outside a battle the party stands together, so anyone can reach anyone.'
          : 'Dropped goods land in a pile where the party stands, and the party can pick them up again.'
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={nothing || (mode === 'give' && recipient === '')}
            onClick={() => void submit()}
          >
            {mode === 'give' ? 'Give' : 'Drop'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && (
          <Banner tone="warning" title="That didn't work">
            {error}
          </Banner>
        )}
        {mode === 'give' && (
          <Field label="Give to">
            <Select
              value={recipient}
              onValueChange={setRecipient}
              options={recipients.map((m) => ({ value: m.id, label: m.name }))}
              placeholder="Choose a party member"
            />
          </Field>
        )}
        {entries.length > 0 && (
          <fieldset className={styles.section}>
            <legend className={styles.slotLabel}>Items</legend>
            <ul className={styles.pickList}>
              {entries.map((entry) => (
                <li key={entry.key} className={styles.pickRow}>
                  <span className={styles.pickName}>
                    <EntryName entry={entry} />
                  </span>
                  {entry.quantity > 1 || entry.kind === 'item' ? (
                    <NumberInput
                      aria-label={`How many ${entry.units}`}
                      incrementLabel={`More ${entry.units}`}
                      decrementLabel={`Fewer ${entry.units}`}
                      value={counts[entry.key] ?? 0}
                      min={0}
                      max={entry.quantity}
                      onChange={(value) => setCounts((c) => ({ ...c, [entry.key]: value ?? 0 }))}
                    />
                  ) : (
                    <Checkbox
                      label={<span className="visually-hidden">{entry.name}</span>}
                      checked={(counts[entry.key] ?? 0) > 0}
                      onCheckedChange={(checked) =>
                        setCounts((c) => ({ ...c, [entry.key]: checked ? 1 : 0 }))
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <fieldset className={styles.section}>
          <legend className={styles.slotLabel}>Coins</legend>
          <div className={styles.formRow}>
            {COINS.filter((c) => model.inventory.purse[c] > 0).map((c) => (
              <Field key={c} label={`${COIN_NAMES[c]} (${model.inventory.purse[c]})`}>
                <NumberInput
                  incrementLabel={`More ${COIN_NAMES[c].toLowerCase()} pieces`}
                  decrementLabel={`Fewer ${COIN_NAMES[c].toLowerCase()} pieces`}
                  value={coins[c]}
                  min={0}
                  max={model.inventory.purse[c]}
                  width={5}
                  onChange={(value) => setCoins((all) => ({ ...all, [c]: value ?? 0 }))}
                />
              </Field>
            ))}
            {COINS.every((c) => model.inventory.purse[c] === 0) && (
              <p className={styles.muted}>{member.name} has no coins.</p>
            )}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

/** Uses a magic item: drinks a potion, reads a scroll, or works a wand, staff, or rod. */
function UseItemDialog({
  member,
  entry,
  onClose,
}: {
  member: MemberView;
  entry: InventoryEntry;
  onClose: () => void;
}) {
  const party = useParty();
  const encounter = useEncounter();
  const ctx = useTextContext();
  const spells = useSpellCatalog();
  const { send, pending } = useSendCommand();
  const [target, setTarget] = useState<string>('self');
  const [spellId, setSpellId] = useState<string | null>(null);
  const [mode, setMode] = useState<string>('');
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scroll = /scroll/i.test(entry.name);
  const spell = useSpellDetail(scroll && spellId ? spellId : null);

  const targetOptions = [
    { value: 'self', label: `${member.name} (the user)` },
    ...party.filter((m) => m.id !== member.id).map((m) => ({ value: m.id, label: m.name })),
    ...(encounter?.groups ?? []).map((g) => ({ value: g.id, label: capitalizeFirst(groupName(g.id, ctx)) })),
  ];
  const creatureOptions = targetOptions.filter((o) => o.value !== 'self');

  const submit = async () => {
    setError(null);
    const command: Record<string, unknown> & { command_type: string } = {
      command_type: 'use_item',
      character_id: member.id,
      item_id: entry.commandId,
    };
    if (target !== 'self') command.target_id = target;
    if (scroll && spellId) command.spell_id = spellId;
    if (scroll && mode) command.mode = mode;
    if (scroll && targets.length > 0) command.targets = targets;
    const result = await send(command, { display: 'inline' });
    if (result.status === 'accepted') onClose();
    else if (result.status !== 'conflict') setError(result.message);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Use ${entry.name.toLowerCase()}`}
      description="Using a magic item takes a round and reveals what it is."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="spell" loading={pending} onClick={() => void submit()}>
            Use it
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && (
          <Banner tone="warning" title="That didn't work">
            {error}
          </Banner>
        )}
        <Field
          label="Use it on"
          hint="A potion is drunk by the member you choose. A wand, staff, or rod aims at a member or a group."
        >
          <Select value={target} onValueChange={setTarget} options={targetOptions} />
        </Field>
        {scroll && (
          <>
            <Field label="Spell to read" hint="Leave it empty to read the first spell on the scroll.">
              <Combobox
                value={spellId}
                onChange={(value) => {
                  setSpellId(value);
                  setMode('');
                }}
                placeholder="Search spells"
                options={(spells.data ?? []).map((spell) => ({
                  value: spell.id,
                  label: spell.name,
                  description: `${spell.spell_list === 'magic_user' ? 'Magic-user' : capitalizeFirst(spell.spell_list.replaceAll('_', ' '))}, level ${spell.level}`,
                }))}
              />
            </Field>
            {spell.data && spell.data.modes.length > 1 && (
              <Field label="How to cast it">
                <Select
                  value={mode}
                  onValueChange={setMode}
                  placeholder="The spell's first usage"
                  options={spell.data.modes.map((m) => ({
                    value: m.key,
                    label: capitalizeFirst(m.key.replaceAll('_', ' ')),
                    description: m.prose,
                  }))}
                />
              </Field>
            )}
            {creatureOptions.length > 0 && (
              <fieldset className={styles.section}>
                <legend className={styles.slotLabel}>The spell's targets</legend>
                {creatureOptions.map((o) => (
                  <Checkbox
                    key={o.value}
                    label={o.label}
                    checked={targets.includes(o.value)}
                    onCheckedChange={(checked) =>
                      setTargets((all) => (checked ? [...all, o.value] : all.filter((t) => t !== o.value)))
                    }
                  />
                ))}
              </fieldset>
            )}
          </>
        )}
        <p className={styles.note}>
          <Icon name="info" size={14} /> The rules engine checks whether {member.name} can use it, and says
          why if not.
        </p>
      </div>
    </Dialog>
  );
}
