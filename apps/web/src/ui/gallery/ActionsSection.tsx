import { useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { Kbd } from '../components/Kbd';
import { Link, LinkButton } from '../components/Link';
import { DropdownMenu } from '../components/Menu';
import { ToolRail, ToolRailButton } from '../layout/TableLayout';
import { Caption, Grid, Row, Section, Specimen, Stack } from './parts';

export function ActionsSection() {
  const [saving, setSaving] = useState(false);
  const [pressed, setPressed] = useState(true);
  return (
    <Section
      id="actions"
      title="Buttons and links"
      description="One button component. Use primary at most once per view, and danger only for actions that destroy something or can't be undone."
    >
      <Specimen title="Variants" wide>
        <Stack gap="md">
          <Row>
            <Button variant="primary" icon="send">
              Start the game
            </Button>
            <Button variant="secondary" icon="save">
              Save game
            </Button>
            <Button variant="ghost" icon="copy">
              Copy invite link
            </Button>
            <Button variant="danger" icon="trash">
              Delete table
            </Button>
          </Row>
          <Row>
            <Button variant="primary" disabled>
              Start the game
            </Button>
            <Button variant="secondary" disabled>
              Save game
            </Button>
            <Button variant="ghost" disabled>
              Copy invite link
            </Button>
            <Button variant="danger" disabled>
              Delete table
            </Button>
            <Caption>Disabled</Caption>
          </Row>
          <Row>
            <Button
              variant="primary"
              loading={saving}
              onClick={() => {
                setSaving(true);
                setTimeout(() => setSaving(false), 1600);
              }}
            >
              Save game
            </Button>
            <Button variant="secondary" loading>
              Uploading adventure
            </Button>
            <Caption>Loading keeps the width and ignores clicks</Caption>
          </Row>
        </Stack>
      </Specimen>
      <Grid min={320}>
        <Specimen title="Sizes and icons">
          <Stack gap="md">
            <Row>
              <Button size="sm" variant="secondary">
                Small
              </Button>
              <Button size="md" variant="secondary">
                Medium
              </Button>
              <Button size="lg" variant="secondary">
                Large
              </Button>
            </Row>
            <Row>
              <Button variant="secondary" iconEnd="chevron-down">
                Marching order
              </Button>
              <Button variant="primary" size="lg" icon="dice" block>
                Roll 3d6 for strength
              </Button>
            </Row>
          </Stack>
        </Specimen>
        <Specimen title="Icon buttons" note="Every icon button has a label for screen readers and a tooltip.">
          <Stack gap="md">
            <Row>
              <IconButton icon="settings" label="Table settings" />
              <IconButton icon="more" label="More actions" variant="secondary" />
              <IconButton icon="ruler" label="Ruler" pressed={pressed} onClick={() => setPressed(!pressed)} />
              <IconButton icon="trash" label="Remove token" variant="danger" />
              <IconButton icon="plus" label="Add" variant="primary" />
              <IconButton icon="refresh" label="Refreshing" loading />
              <IconButton icon="close" label="Close" disabled />
              <IconButton
                icon="ping"
                label="Ping"
                disabled
                disabledReason="Only people with a character at the table can ping the map."
              />
            </Row>
            <Row>
              <IconButton icon="zoom-in" label="Zoom in" size="sm" />
              <IconButton icon="zoom-in" label="Zoom in" size="md" />
              <IconButton icon="zoom-in" label="Zoom in" size="lg" />
              <Caption>28, 32, and 40 px</Caption>
            </Row>
          </Stack>
        </Specimen>
        <Specimen
          title="Hover help"
          note="Hover or tab to each control. Unavailable controls stay focusable and show why when hovered, focused, or pressed."
          wide
        >
          <Stack gap="md">
            <Row>
              <Button icon="search" shortcut="S" tooltip="Search the room for secret doors and traps">
                Search
              </Button>
              <IconButton
                icon="hourglass"
                label="Advance time"
                tooltip="Advance time by 1 turn (10 minutes)"
              />
              <LinkButton tooltip="Open in the rules reference">Magic missile</LinkButton>
              <Caption>With a tooltip</Caption>
            </Row>
            <Row>
              <Button
                variant="primary"
                icon="play"
                disabled
                disabledReason="Add at least one character to the party to start the game."
              >
                Start game
              </Button>
              <IconButton
                icon="arrow-up"
                label="Move Wren forward"
                disabled
                disabledReason="Wren already leads the marching order."
              />
              <DropdownMenu
                trigger={<Button iconEnd="chevron-down">Member actions</Button>}
                items={[
                  {
                    label: 'Make player',
                    icon: 'user',
                    disabled: true,
                    disabledReason: 'Every table needs a referee. Make another member a referee first.',
                  },
                  { label: 'Remove from table', icon: 'log-out', danger: true },
                ]}
              />
              <Caption>Unavailable, with a reason</Caption>
            </Row>
            <Row>
              <ToolRail aria-label="Map tools">
                <ToolRailButton
                  icon="ruler"
                  label="Measure"
                  tooltip="Measure distance in squares and feet, on your screen only"
                  shortcut="R"
                />
              </ToolRail>
              <Caption>Tool rail tooltips open to the right and show the key</Caption>
            </Row>
          </Stack>
        </Specimen>
        <Specimen title="Links and keys">
          <Stack gap="md">
            <p>
              Read the <Link href="#actions">house rules</Link> before the first session, or open the{' '}
              <Link href="https://github.com/mmacy/bxapi" external>
                bxapi reference
              </Link>
              .
            </p>
            <p>
              <Link tone="quiet" href="#actions">
                Leave this table
              </Link>
            </p>
            <Row>
              <Kbd keys={['Ctrl', 'K']} />
              <Kbd keys="Esc" />
              <Kbd keys={['Shift', 'F10']} />
              <Kbd keys="M" />
            </Row>
          </Stack>
        </Specimen>
      </Grid>
    </Section>
  );
}
