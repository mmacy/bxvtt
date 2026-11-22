import { capitalizeFirst, magicItemTemplateName, prettifyId } from '@bxvtt/shared/text';
import { useRefereeState } from '@/app';
import { Badge, Banner } from '@/ui';
import { compactDuration, effectLabel } from './actions';
import styles from './sheet.module.css';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface MagicFact {
  id: string;
  name: string;
  identified: boolean;
  charges: number | null;
  cursed: boolean;
}

function magicFacts(inventory: unknown): MagicFact[] {
  if (!isRecord(inventory)) return [];
  const all: unknown[] = [
    ...(Array.isArray(inventory.items) ? inventory.items : []),
    ...(Array.isArray(inventory.wielded) ? inventory.wielded : []),
    ...(Array.isArray(inventory.rings) ? inventory.rings : []),
    inventory.worn_armour,
    inventory.shield,
  ];
  return all.flatMap((entry) => {
    if (!isRecord(entry) || entry.instance_type !== 'magic_item') return [];
    const templateId = typeof entry.template_id === 'string' ? entry.template_id : '';
    return [
      {
        id: typeof entry.instance_id === 'string' ? entry.instance_id : templateId,
        name: capitalizeFirst(magicItemTemplateName(templateId) ?? prettifyId(templateId)),
        identified: entry.identified === true,
        charges: typeof entry.charges_remaining === 'number' ? entry.charges_remaining : null,
        cursed: entry.cursed_revealed === true,
      },
    ];
  });
}

/**
 * What the referee state adds to a member's sheet: true names and charges of magic items, damage that rest
 * doesn't heal, stat modifiers, and every timed effect with its time left, potions included. It renders only
 * for a referee with the lens on, because `useRefereeState` returns `null` otherwise.
 */
export function RefereeNotes({ memberId }: { memberId: string }) {
  const referee = useRefereeState();
  if (referee === null) return null;
  const character = referee.party.members.find((m) => m.id === memberId);
  if (!character) return null;
  const items = magicFacts(character.inventory);
  const effects = referee.ledger.effects.filter((effect) => effect.target_ref === memberId);
  const modifiers = character.stat_modifiers ?? [];
  const nothing =
    items.length === 0 && effects.length === 0 && modifiers.length === 0 && character.nonregen_damage === 0;

  return (
    <Banner tone="referee" title="Referee only" icon="referee">
      {nothing ? (
        <p className={styles.prose}>The referee state adds nothing hidden for {character.name}.</p>
      ) : (
        <ul className={styles.refereeList}>
          {items.map((item) => (
            <li key={item.id}>
              {item.name}
              {!item.identified && ' (the players see it unidentified)'}
              {item.charges !== null && `, ${item.charges} ${item.charges === 1 ? 'charge' : 'charges'} left`}
              {item.cursed && (
                <>
                  {' '}
                  <Badge tone="danger">Curse revealed</Badge>
                </>
              )}
            </li>
          ))}
          {effects.map((effect) => {
            const definition: Record<string, unknown> = isRecord(effect.definition) ? effect.definition : {};
            const kind = typeof definition.kind === 'string' ? definition.kind : 'effect';
            const left =
              typeof effect.expires_round === 'number'
                ? compactDuration(effect.expires_round - referee.clock_rounds)
                : 'no end';
            return (
              <li key={effect.effect_id}>
                {effectLabel(kind)}: {left} left
              </li>
            );
          })}
          {modifiers.map((modifier, index) => {
            const record: Record<string, unknown> = isRecord(modifier) ? modifier : {};
            const kind = typeof record.kind === 'string' ? prettifyId(record.kind) : 'modifier';
            const value = typeof record.value === 'number' ? record.value : 0;
            return (
              <li key={index}>
                {capitalizeFirst(kind)} {value >= 0 ? `+${value}` : `−${Math.abs(value)}`}
              </li>
            );
          })}
          {character.nonregen_damage > 0 && (
            <li>{character.nonregen_damage} damage that natural healing can't restore</li>
          )}
        </ul>
      )}
    </Banner>
  );
}
