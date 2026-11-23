import { useCallback, useState } from 'react';
import { Accordion } from '../components/Accordion';
import { Button, IconButton } from '../components/Button';
import { CommandPalette, useCommandPaletteShortcut, type CommandAction } from '../components/CommandPalette';
import { ConfirmDialog, Dialog, DialogClose, Drawer } from '../components/Dialog';
import { Field } from '../components/Field';
import { Kbd } from '../components/Kbd';
import { ContextMenu, DropdownMenu } from '../components/Menu';
import { Popover } from '../components/Popover';
import { Stepper } from '../components/Stepper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/Tabs';
import { TextInput } from '../components/TextInput';
import { toast } from '../components/toastStore';
import { HpBar } from '../game/StatBlock';
import { TokenPortrait } from '../game/TokenPortrait';
import { LayersSpecimen } from './LayersSpecimen';
import { Caption, Grid, Row, Section, Specimen, Stack } from './parts';
import styles from './Gallery.module.css';

const wizardSteps = [
  { id: 'abilities', label: 'Roll abilities', description: '3d6 in order' },
  { id: 'class', label: 'Choose a class', description: 'Halfling' },
  { id: 'hp', label: 'Hit points' },
  { id: 'equipment', label: 'Buy equipment' },
  { id: 'name', label: 'Name and alignment' },
];

export function OverlaysSection() {
  const [step, setStep] = useState(2);
  const [lens, setLens] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteShortcut(openPalette);

  const actions: CommandAction[] = [
    {
      id: 'search',
      label: 'Search for secret doors',
      group: 'Party',
      icon: 'eye',
      shortcut: 'S',
      onRun: () => toast.info('The party searches the room.'),
    },
    {
      id: 'listen',
      label: 'Listen at the door',
      group: 'Party',
      icon: 'ear',
      onRun: () => toast.info('Nettle listens at the door.'),
    },
    {
      id: 'rest',
      label: 'Rest for a turn',
      group: 'Party',
      icon: 'rest',
      onRun: () => toast.info('The party rests.'),
    },
    {
      id: 'save',
      label: 'Save game',
      group: 'Table',
      icon: 'save',
      shortcut: ['Ctrl', 'S'],
      onRun: () => toast.success('Game saved'),
    },
    {
      id: 'invite',
      label: 'Copy invite link',
      group: 'Table',
      icon: 'link',
      onRun: () => toast.success('Invite link copied'),
    },
    {
      id: 'monster',
      label: 'Add a wandering monster',
      group: 'Referee',
      icon: 'skull',
      keywords: ['encounter'],
      onRun: () => toast.info('Roll on the wandering monster table.'),
    },
    {
      id: 'reveal',
      label: 'Reveal the whole map',
      group: 'Referee',
      icon: 'eye-off',
      disabled: true,
      onRun: () => {},
    },
  ];

  return (
    <Section
      id="overlays"
      title="Navigation and overlays"
      description="Dialogs trap focus and close on Escape. Menus support arrow keys and type-ahead. Built on Radix primitives with the kit's styling."
    >
      <Grid min={340}>
        <Specimen
          title="Tabs"
          note="Use line tabs for docks and sheets, and enclosed tabs for small view switches."
        >
          <Stack gap="lg">
            <Tabs defaultValue="party">
              <TabsList aria-label="Dock">
                <TabsTrigger value="party" icon="users">
                  Party
                </TabsTrigger>
                <TabsTrigger value="feed" icon="feed" count={3}>
                  Feed
                </TabsTrigger>
                <TabsTrigger value="journal" icon="journal">
                  Journal
                </TabsTrigger>
                <TabsTrigger value="referee" icon="referee" disabled>
                  Referee
                </TabsTrigger>
              </TabsList>
              <TabsContent value="party" className={styles.tabPanel}>
                Seven adventurers, marching two abreast.
              </TabsContent>
              <TabsContent value="feed" className={styles.tabPanel}>
                Three new entries since you last looked.
              </TabsContent>
              <TabsContent value="journal" className={styles.tabPanel}>
                Notes the party has written together.
              </TabsContent>
            </Tabs>
            <Tabs defaultValue="sheet" variant="enclosed">
              <TabsList aria-label="Character">
                <TabsTrigger value="sheet">Sheet</TabsTrigger>
                <TabsTrigger value="gear">Equipment</TabsTrigger>
                <TabsTrigger value="spells">Spells</TabsTrigger>
              </TabsList>
            </Tabs>
          </Stack>
        </Specimen>
        <LayersSpecimen />
        <Specimen title="Dialogs and drawers">
          <Stack gap="md">
            <Row>
              <Dialog
                trigger={<Button variant="secondary">Rename table</Button>}
                title="Rename table"
                description="Everyone at the table sees the new name at once."
                footer={
                  <>
                    <DialogClose>
                      <Button variant="ghost">Cancel</Button>
                    </DialogClose>
                    <DialogClose>
                      <Button variant="primary" onClick={() => toast.success('Table renamed')}>
                        Rename
                      </Button>
                    </DialogClose>
                  </>
                }
              >
                <Field label="Table name">
                  <TextInput defaultValue="Thursday at the Drowned Bell" />
                </Field>
              </Dialog>
              <ConfirmDialog
                trigger={<Button variant="danger">Restore save</Button>}
                title="Restore the save from turn 12?"
                description="The table returns to turn 12 in the caves. Anything that happened after that save is lost for everyone."
                confirmLabel="Restore save"
                tone="danger"
                onConfirm={() =>
                  new Promise<void>((resolve) => setTimeout(resolve, 900)).then(() => {
                    toast.success('Save restored', { description: 'The party is back at turn 12.' });
                  })
                }
              />
            </Row>
            <Row>
              <Drawer
                trigger={
                  <Button variant="secondary" icon="skull">
                    Show stat block
                  </Button>
                }
                title="Hobgoblin"
                description="Referee only"
                footer={
                  <DialogClose>
                    <Button variant="primary">Place on map</Button>
                  </DialogClose>
                }
              >
                <Stack gap="md">
                  <Row>
                    <TokenPortrait name="Hobgoblin chief" kind="monster" color="vermilion" size={64} />
                    <Stack gap="sm">
                      <p className={styles.statLine}>
                        AC 6, HD 1+1, hp 9, MV 90′ (30′), #AT 1, D 1d8, Save F1, ML 8
                      </p>
                      <HpBar current={9} max={9} />
                    </Stack>
                  </Row>
                  <p className={styles.muted}>
                    Hobgoblins are larger cousins of goblins. Their chief fights with a battle axe and never
                    retreats while his guards stand.
                  </p>
                </Stack>
              </Drawer>
              <Button variant="ghost" icon="command" onClick={openPalette}>
                Command palette
              </Button>
              <Kbd keys={['Ctrl', 'K']} />
            </Row>
          </Stack>
        </Specimen>
        <Specimen title="Popovers, tooltips, and menus" note="Right-click the token for its context menu.">
          <Stack gap="md">
            <Row>
              <Popover
                trigger={
                  <Button variant="secondary" iconEnd="chevron-down">
                    Light
                  </Button>
                }
                title="Party light"
              >
                <Stack gap="sm">
                  <p className={styles.muted}>Wren carries a torch. It burns out in 4 turns.</p>
                  <Row gap="sm">
                    <Button size="sm" variant="secondary" icon="torch">
                      Light a torch
                    </Button>
                    <Button size="sm" variant="ghost" icon="lantern">
                      Lantern
                    </Button>
                  </Row>
                </Stack>
              </Popover>
              <IconButton icon="ping" label="Ping the map" shortcut="P" variant="secondary" />
              <Button variant="ghost" tooltip="Armour class 4, where lower is harder to hit">
                AC 4
              </Button>
              <DropdownMenu
                trigger={<IconButton icon="more" label="Table menu" variant="secondary" />}
                items={[
                  { type: 'label', label: 'Thursday at the Drowned Bell' },
                  {
                    label: 'Save game',
                    icon: 'save',
                    shortcut: ['Ctrl', 'S'],
                    onSelect: () => toast.success('Game saved'),
                  },
                  {
                    label: 'Copy invite link',
                    icon: 'link',
                    onSelect: () => toast.success('Invite link copied'),
                  },
                  { type: 'checkbox', label: 'Referee lens', checked: lens, onCheckedChange: setLens },
                  {
                    type: 'submenu',
                    label: 'Map style',
                    icon: 'map',
                    items: [
                      { label: 'Blue-line', onSelect: () => {} },
                      { label: 'Torchlit', onSelect: () => {} },
                    ],
                  },
                  { type: 'separator' },
                  {
                    label: 'Leave table',
                    icon: 'log-out',
                    danger: true,
                    onSelect: () => toast.info('You left the table.'),
                  },
                ]}
              />
            </Row>
            <ContextMenu
              items={[
                { label: 'Open character sheet', icon: 'book' },
                { label: 'Center the map here', icon: 'target' },
                { label: 'Whisper to Sam', icon: 'whisper' },
                { type: 'separator' },
                { label: 'Mark as unconscious', icon: 'moon' },
                { label: 'Remove from the map', icon: 'trash', danger: true },
              ]}
            >
              <div
                className={styles.contextTarget}
                tabIndex={0}
                aria-label="Wren's token. Press Shift+F10 for actions."
              >
                <TokenPortrait
                  name="Wren Underbough"
                  characterClass="halfling"
                  color="saffron"
                  size={48}
                  decorative
                />
                <span>Right-click or press Shift+F10</span>
              </div>
            </ContextMenu>
          </Stack>
        </Specimen>
        <Specimen
          title="Toasts"
          note="Call toast.success, toast.error, or toast.info from anywhere. Hover a toast to keep it open."
        >
          <Row>
            <Button
              variant="secondary"
              icon="success"
              onClick={() => toast.success('Game saved', { description: 'Turn 14, the caves of chaos.' })}
            >
              Success
            </Button>
            <Button
              variant="secondary"
              icon="error"
              onClick={() =>
                toast.error("Wren can't attack in melee", {
                  description: "She isn't in the front rank. Move her up or attack with her sling.",
                })
              }
            >
              Error
            </Button>
            <Button
              variant="secondary"
              icon="info"
              onClick={() =>
                toast.info('Marta joined the table', {
                  action: { label: 'Give a seat', onClick: () => toast.success('Marta now controls Kael') },
                })
              }
            >
              Info with action
            </Button>
          </Row>
        </Specimen>
        <Specimen title="Accordion">
          <Accordion
            type="multiple"
            defaultValue={['level-1']}
            items={[
              { value: 'level-1', title: 'First level spells', meta: '2 of 2', content: 'Sleep, read magic' },
              { value: 'level-2', title: 'Second level spells', meta: '1 of 1', content: 'Web' },
              {
                value: 'level-3',
                title: 'Third level spells',
                meta: '0',
                content: "Ilsabet can't cast third level spells yet.",
                disabled: true,
              },
            ]}
          />
        </Specimen>
        <Specimen title="Stepper" note="Completed steps are buttons, so the player can go back.">
          <Stack gap="md">
            <Stepper
              aria-label="Character creation"
              steps={wizardSteps}
              current={step}
              onStepClick={setStep}
            />
            <Row gap="sm">
              <Button
                size="sm"
                variant="ghost"
                icon="chevron-left"
                disabled={step === 0}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
              <Button
                size="sm"
                variant="secondary"
                iconEnd="chevron-right"
                disabled={step === wizardSteps.length - 1}
                onClick={() => setStep(step + 1)}
              >
                Next
              </Button>
              <Caption>
                Step {step + 1} of {wizardSteps.length}
              </Caption>
            </Row>
          </Stack>
        </Specimen>
      </Grid>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} actions={actions} />
    </Section>
  );
}
