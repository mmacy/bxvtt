import { useState } from 'react';
import { Checkbox, RadioGroup, SegmentedControl, Slider, Switch } from '../components/Choice';
import { Combobox, type ComboboxOption } from '../components/Combobox';
import { Field } from '../components/Field';
import { NumberInput } from '../components/NumberInput';
import { Select } from '../components/Select';
import { SearchInput, TextInput, Textarea } from '../components/TextInput';
import { Grid, Row, Section, Specimen, Stack } from './parts';
import { monsters } from './sampleData';

const monsterOptions: ComboboxOption[] = monsters.map((m) => ({
  value: m.id,
  label: m.name,
  description: `AC ${m.ac}, HD ${m.hd}, ML ${m.morale}`,
  icon: 'skull',
}));

const spellOptions: ComboboxOption[] = [
  { value: 'cure-light-wounds', label: 'Cure light wounds', description: 'Cleric, level 1', icon: 'heart' },
  { value: 'detect-evil', label: 'Detect evil', description: 'Cleric, level 1', icon: 'eye' },
  {
    value: 'protection-from-evil',
    label: 'Protection from evil',
    description: 'Cleric or magic-user, level 1',
    icon: 'shield',
  },
  { value: 'sleep', label: 'Sleep', description: 'Magic-user, level 1', icon: 'spell', keywords: ['mu'] },
  {
    value: 'magic-missile',
    label: 'Magic missile',
    description: 'Magic-user, level 1',
    icon: 'spell',
    keywords: ['mu'],
  },
  { value: 'light', label: 'Light', description: 'Cleric or magic-user, level 1', icon: 'torch' },
  { value: 'read-languages', label: 'Read languages', description: 'Magic-user, level 1', icon: 'scroll' },
  { value: 'shield', label: 'Shield', description: 'Magic-user, level 1', icon: 'shield', disabled: true },
];

export function FormsSection() {
  const [name, setName] = useState('Wren Underbough');
  const [search, setSearch] = useState('torch');
  const [count, setCount] = useState<number | null>(6);
  const [gp, setGp] = useState<number | null>(120);
  const [alignment, setAlignment] = useState('neutral');
  const [monster, setMonster] = useState<string | null>('hobgoblin');
  const [spell, setSpell] = useState<string | null>(null);
  const [lens, setLens] = useState(true);
  const [mapTheme, setMapTheme] = useState('blue');
  const [light, setLight] = useState(30);
  return (
    <Section
      id="forms"
      title="Form controls"
      description="Put each control in a Field. The Field supplies the label, hint, and error, and wires their ids to the control."
    >
      <Grid min={320}>
        <Specimen title="Text">
          <Stack gap="md">
            <Field
              label="Character name"
              hint="Shown on the map and in the feed."
              aside={`${name.length}/40`}
            >
              <TextInput value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field
              label="Invite code"
              error="That invite code has expired. Ask the referee for a new link."
              required
            >
              <TextInput defaultValue="GRAY-OWL-17" icon="key" />
            </Field>
            <Field label="Table name" disabled>
              <TextInput defaultValue="Thursday at the Drowned Bell" />
            </Field>
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search equipment"
              aria-label="Search equipment"
            />
          </Stack>
        </Specimen>
        <Specimen title="Numbers and choices">
          <Stack gap="md">
            <Row gap="lg" align="start">
              <Field label="Arrows">
                <NumberInput value={count} onChange={setCount} min={0} max={40} />
              </Field>
              <Field label="Gold pieces" hint="0 to 9999">
                <NumberInput value={gp} onChange={setGp} min={0} max={9999} step={10} width={4} />
              </Field>
            </Row>
            <Field label="Alignment">
              <Select
                value={alignment}
                onValueChange={setAlignment}
                options={[
                  { value: 'lawful', label: 'Lawful' },
                  { value: 'neutral', label: 'Neutral' },
                  { value: 'chaotic', label: 'Chaotic' },
                ]}
              />
            </Field>
            <Field label="Adventure">
              <Select
                placeholder="Choose an adventure"
                options={[
                  {
                    label: 'Included with bxapi',
                    options: [
                      { value: 'b2', label: 'The Keep on the Borderlands', icon: 'town' },
                      { value: 'b1', label: 'In Search of the Unknown', icon: 'map' },
                    ],
                  },
                  {
                    label: 'Samples',
                    options: [
                      { value: 'crypt', label: 'The Sunken Crypt', icon: 'skull' },
                      {
                        value: 'upload',
                        label: 'Upload an adventure document',
                        icon: 'upload',
                        disabled: true,
                      },
                    ],
                  },
                ]}
              />
            </Field>
          </Stack>
        </Specimen>
        <Specimen title="Search select">
          <Stack gap="md">
            <Field label="Monster" hint="Type to filter. Arrow keys move, Enter picks, Escape closes.">
              <Combobox
                options={monsterOptions}
                value={monster}
                onChange={setMonster}
                placeholder="Search monsters"
              />
            </Field>
            <Field label="Spell to prepare">
              <Combobox
                options={spellOptions}
                value={spell}
                onChange={setSpell}
                placeholder="Search spells"
                emptyText="No spell by that name"
              />
            </Field>
            <Field label="Notes for the referee" hint="Only referees see these notes.">
              <Textarea defaultValue="Wren pockets the silver idol before anyone notices." rows={3} />
            </Field>
          </Stack>
        </Specimen>
        <Specimen title="Toggles">
          <Stack gap="md">
            <Switch
              label="Referee lens"
              description="Show what only referees can see. Turn it off to see the table as the players do."
              checked={lens}
              onCheckedChange={setLens}
            />
            <Switch label="Resolve rounds when everyone has declared" defaultChecked />
            <Switch label="Let anyone with a seat move the party" disabled />
            <Checkbox label="Ready to start" defaultChecked />
            <Checkbox
              label="All party members"
              checked="indeterminate"
              description="Three of five are selected."
            />
            <Checkbox label="Retainers" disabled />
          </Stack>
        </Specimen>
        <Specimen title="Radio and segments">
          <Stack gap="md">
            <RadioGroup
              aria-label="Who can move the party"
              defaultValue="caller"
              options={[
                {
                  value: 'caller',
                  label: 'The caller',
                  description: 'As in B/X: one player speaks for the party.',
                },
                { value: 'anyone', label: 'Anyone with a seat' },
                { value: 'referee', label: 'Only the referee', disabled: true },
              ]}
            />
            <SegmentedControl
              aria-label="Map style"
              value={mapTheme}
              onValueChange={setMapTheme}
              options={[
                { value: 'blue', label: 'Blue-line', icon: 'map' },
                { value: 'torch', label: 'Torchlit', icon: 'torch' },
              ]}
            />
            <SegmentedControl
              aria-label="Marching formation"
              size="sm"
              value="two"
              onValueChange={() => {}}
              options={[
                { value: 'one', label: 'Single file' },
                { value: 'two', label: 'Two abreast' },
                { value: 'three', label: 'Three abreast', disabled: true },
              ]}
            />
          </Stack>
        </Specimen>
        <Specimen title="Slider">
          <Stack gap="lg">
            <Slider
              label="Light radius"
              value={light}
              onValueChange={setLight}
              min={0}
              max={60}
              step={10}
              formatValue={(v) => `${v} ft`}
            />
            <Slider
              label="Map zoom"
              defaultValue={100}
              min={25}
              max={400}
              step={25}
              formatValue={(v) => `${v}%`}
            />
            <Slider label="Fog opacity" defaultValue={70} disabled formatValue={(v) => `${v}%`} />
          </Stack>
        </Specimen>
      </Grid>
    </Section>
  );
}
