import { useState } from 'react';
import { Button } from '../components/Button';
import { DiceRoll, type RolledDie } from '../dice/DiceRoll';
import { Die, type DieSides } from '../dice/Die';
import { playerColors } from '../tokens';
import { Caption, Grid, Row, Section, Specimen, Stack } from './parts';
import styles from './Gallery.module.css';

const faces: Array<{ sides: DieSides; value: number }> = [
  { sides: 4, value: 3 },
  { sides: 6, value: 5 },
  { sides: 8, value: 6 },
  { sides: 10, value: 9 },
  { sides: 12, value: 11 },
  { sides: 20, value: 17 },
  { sides: 100, value: 47 },
];

// The gallery stands in for the server here. In the app, results always come from bxapi.
function serverRoll(spec: Array<DieSides>): RolledDie[] {
  return spec.map((sides) => ({ sides, value: Math.floor(Math.random() * sides) + 1 }));
}

export function DiceSection() {
  const [abilities, setAbilities] = useState(() => ({ key: 0, dice: serverRoll([6, 6, 6]) }));
  const [attack, setAttack] = useState(() => ({ key: 0, dice: [{ sides: 20 as const, value: 20 }] }));
  const [damage, setDamage] = useState(() => ({
    key: 0,
    dice: [
      { sides: 8 as const, value: 1 },
      { sides: 6 as const, value: 4 },
    ],
  }));
  const [mixed, setMixed] = useState(() => ({ key: 0, dice: serverRoll([4, 6, 8, 10, 12, 20, 100]) }));
  return (
    <Section
      id="dice"
      title="Dice"
      description="The server rolls every die. DiceRoll only plays the result: the dice tumble for under a second and land on the faces the server sent. Click the dice to land them at once."
    >
      <Specimen
        title="Faces"
        note="Bone resin with numerals filled in like the crayon dice in the 1981 boxed set. 6 and 9 are underlined."
        wide
      >
        <Stack gap="lg">
          <Row gap="lg" align="end">
            {faces.map((f) => (
              <div key={f.sides} className={styles.dieCell}>
                <Die sides={f.sides} value={f.value} size={64} />
                <Caption>d{f.sides === 100 ? '%' : f.sides}</Caption>
              </div>
            ))}
          </Row>
          <Row gap="md" align="end">
            {faces.slice(0, 6).map((f) => (
              <Die key={f.sides} sides={f.sides} size={40} />
            ))}
            <Caption>Blank, for a dice picker</Caption>
          </Row>
          <Row gap="sm">
            {playerColors.map((color, i) => (
              <Die key={color.id} sides={20} value={((i * 7) % 20) + 1} size={36} color={color.id} />
            ))}
            <Caption>Numerals in each player color</Caption>
          </Row>
          <Row gap="md">
            <Die sides={20} value={20} size={48} highlight="max" />
            <Die sides={20} value={1} size={48} highlight="min" />
            <Caption>Highest and lowest faces</Caption>
          </Row>
        </Stack>
      </Specimen>
      <Grid min={360}>
        <Specimen title="Ability roll" note="As in the character wizard: 3d6 in order.">
          <Stack gap="md">
            <DiceRoll key={abilities.key} dice={abilities.dice} label="Strength" size={56} color="saffron" />
            <Row>
              <Button
                size="sm"
                variant="secondary"
                icon="dice"
                onClick={() => setAbilities({ key: abilities.key + 1, dice: serverRoll([6, 6, 6]) })}
              >
                Roll again
              </Button>
            </Row>
          </Stack>
        </Specimen>
        <Specimen title="In the feed" note="Smaller dice. Older entries pass animate={false}.">
          <Stack gap="md">
            <div className={styles.feedEntry}>
              <DiceRoll
                key={attack.key}
                dice={attack.dice}
                modifier={1}
                label="Kael attacks the hobgoblin"
                size={36}
                color="vermilion"
              />
            </div>
            <div className={styles.feedEntry}>
              <DiceRoll key={damage.key} dice={damage.dice} label="Damage" size={36} color="vermilion" />
            </div>
            <div className={styles.feedEntry}>
              <DiceRoll
                dice={[{ sides: 6, value: 2 }]}
                label="Wandering monster check"
                size={32}
                animate={false}
              />
            </div>
            <Row gap="sm">
              <Button
                size="sm"
                variant="secondary"
                icon="dice"
                onClick={() =>
                  setAttack({
                    key: attack.key + 1,
                    dice: [{ sides: 20, value: Math.floor(Math.random() * 20) + 1 }],
                  })
                }
              >
                Attack
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="dice"
                onClick={() =>
                  setDamage({
                    key: damage.key + 1,
                    dice: [
                      { sides: 8, value: Math.floor(Math.random() * 8) + 1 },
                      { sides: 6, value: Math.floor(Math.random() * 6) + 1 },
                    ],
                  })
                }
              >
                Damage
              </Button>
            </Row>
          </Stack>
        </Specimen>
        <Specimen title="Every die">
          <Stack gap="md">
            <DiceRoll key={mixed.key} dice={mixed.dice} label="A handful" size={40} hideTotal />
            <Row>
              <Button
                size="sm"
                variant="secondary"
                icon="dice"
                onClick={() => setMixed({ key: mixed.key + 1, dice: serverRoll([4, 6, 8, 10, 12, 20, 100]) })}
              >
                Roll again
              </Button>
            </Row>
          </Stack>
        </Specimen>
      </Grid>
    </Section>
  );
}
