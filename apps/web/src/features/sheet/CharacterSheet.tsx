import { useMemo, useState } from 'react';
import {
  useMembers,
  usePartyMember,
  usePlayerView,
  useSeats,
  useTableUser,
  useTextContext,
  type SheetTab,
} from '@/app';
import {
  Avatar,
  ConditionChip,
  Drawer,
  EmptyState,
  Parchment,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/ui';
import { effectLabel, effectRemaining } from './actions';
import { InventoryTab } from './InventoryTab';
import { sheetFromMember } from './model';
import { RefereeNotes } from './RefereeNotes';
import { RuleLinksContext } from './RuleLink';
import {
  AbilityScores,
  Conditions,
  Languages,
  SavingThrows,
  ScoreModifiers,
  SheetHeader,
  ThiefSkills,
  VitalsRow,
  XpProgress,
} from './SheetSections';
import { SpellsTab, hasSpells as memberHasSpells } from './SpellsTab';
import styles from './sheet.module.css';

export interface CharacterSheetProps {
  /** The party member to show, such as `character-0001`, or `null` when the sheet is closed. */
  memberId: string | null;
  /** Closes the sheet. */
  onClose: () => void;
  /** The tab to show when the sheet opens: `sheet` (the default), `inventory`, or `spells`. */
  tab?: SheetTab;
}

/** Who plays a member: the seat owner with their color, or the referee for an empty seat. */
function useController(memberId: string | null) {
  const seats = useSeats();
  const members = useMembers();
  const me = useTableUser();
  return useMemo(() => {
    const seat = seats.find((s) => s.member_id === memberId);
    const owner = seat?.user_id ? (members.find((m) => m.user_id === seat.user_id) ?? null) : null;
    return { owner, mine: owner !== null && owner.user_id === me?.id, empty: !seat?.user_id };
  }, [seats, members, memberId, me]);
}

/**
 * One party member's sheet: abilities, saves, inventory, spells, and the member actions the user may take.
 * The shell renders it and opens it from `useTableUi().openCharacterSheet(memberId)`.
 */
export function CharacterSheet({ memberId, onClose, tab }: CharacterSheetProps) {
  const member = usePartyMember(memberId);
  return (
    <Drawer
      open={memberId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={member?.name ?? 'Character sheet'}
      description={member ? 'Character sheet' : undefined}
      hideTitle={member !== null}
      width="min(700px, 96vw)"
      flush
    >
      {member === null ? (
        <EmptyState
          icon="scroll"
          title="Character not in party"
          description="Select another character in the party panel."
        />
      ) : (
        <SheetContent
          key={`${member.id}:${tab ?? 'sheet'}`}
          memberId={member.id}
          initialTab={tab ?? 'sheet'}
        />
      )}
    </Drawer>
  );
}

function SheetContent({ memberId, initialTab }: { memberId: string; initialTab: SheetTab }) {
  const member = usePartyMember(memberId);
  const ctx = useTextContext();
  const view = usePlayerView();
  const controller = useController(memberId);
  const [chosenTab, setTab] = useState<string>(initialTab);
  const model = useMemo(() => (member ? sheetFromMember(member, ctx) : null), [member, ctx]);
  const hasSpells = memberHasSpells(member);
  const tab = chosenTab === 'spells' && !hasSpells ? 'sheet' : chosenTab;
  if (!member || !model) return null;
  const effects = (view?.effects ?? []).filter((e) => e.character_id === memberId);
  const deprivation = view?.deprivation[memberId];

  const who = controller.owner ? (
    <>
      <Avatar name={controller.owner.name} color={controller.owner.color} size="xs" decorative />
      {controller.mine ? 'You play this character' : `Played by ${controller.owner.name}`}
    </>
  ) : (
    'Empty seat. The referee plays this character.'
  );

  return (
    <RuleLinksContext.Provider value={true}>
      <div className={styles.sheetScroll}>
        <Parchment variant="plain" className={styles.sheetPaper}>
          <SheetHeader model={model} color={controller.owner?.color} controller={who} />
          <Tabs value={tab} onValueChange={setTab} variant="line">
            <TabsList aria-label="Sheet sections" className={styles.tabsBar}>
              <TabsTrigger value="sheet" icon="scroll">
                Sheet
              </TabsTrigger>
              <TabsTrigger value="inventory" icon="chest">
                Inventory
              </TabsTrigger>
              {hasSpells && (
                <TabsTrigger value="spells" icon="spell">
                  Spells
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="sheet">
              <div className={styles.tabPanel}>
                <VitalsRow model={model} />
                <XpProgress model={model} />
                {(model.conditions.length > 0 || effects.length > 0 || deprivation) && (
                  <section className={styles.section} aria-labelledby="sheet-conditions">
                    <h3 id="sheet-conditions" className={styles.sectionTitle}>
                      Conditions and effects
                    </h3>
                    <Conditions conditions={model.conditions} compact />
                    {effects.length > 0 && (
                      <ul className={styles.chips} aria-label="Active effects">
                        {effects.map((effect, index) => (
                          <li key={`${effect.kind}-${index}`}>
                            <ConditionChip
                              label={effectLabel(effect.kind, ctx)}
                              tone={effect.kind === 'light' ? 'boon' : 'magic'}
                              icon={effect.kind === 'light' ? 'torch' : undefined}
                              duration={effectRemaining(effect.remaining_rounds)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    {deprivation && (
                      <p className={styles.note}>
                        {(deprivation.food_days ?? 0) > 0 && `${deprivation.food_days} days without food. `}
                        {(deprivation.water_days ?? 0) > 0 && `${deprivation.water_days} days without water.`}
                      </p>
                    )}
                  </section>
                )}
                <AbilityScores model={model} />
                <div className={styles.columns}>
                  <div className={styles.column}>
                    <ScoreModifiers model={model} />
                    <ThiefSkills skills={model.thiefSkills} />
                  </div>
                  <div className={styles.column}>
                    <SavingThrows model={model} />
                    <Languages languages={model.languages} />
                  </div>
                </div>
                <RefereeNotes memberId={memberId} />
              </div>
            </TabsContent>
            <TabsContent value="inventory">
              <InventoryTab member={member} model={model} />
            </TabsContent>
            {hasSpells && (
              <TabsContent value="spells">
                <SpellsTab member={member} model={model} />
              </TabsContent>
            )}
          </Tabs>
        </Parchment>
      </div>
    </RuleLinksContext.Provider>
  );
}
