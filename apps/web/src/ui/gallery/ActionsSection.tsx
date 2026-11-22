import { useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { Kbd } from '../components/Kbd';
import { Link } from '../components/Link';
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
            </Row>
            <Row>
              <IconButton icon="zoom-in" label="Zoom in" size="sm" />
              <IconButton icon="zoom-in" label="Zoom in" size="md" />
              <IconButton icon="zoom-in" label="Zoom in" size="lg" />
              <Caption>28, 32, and 40 px</Caption>
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
