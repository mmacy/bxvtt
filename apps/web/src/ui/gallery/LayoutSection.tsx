import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Surfaces';
import { PageLayout } from '../layout/PageLayout';
import { Wordmark } from '../layout/Wordmark';
import { Caption, Grid, Row, Section, Specimen, Stack } from './parts';
import { KitTableMock } from './TableMock';
import styles from './Gallery.module.css';

export function LayoutSection() {
  return (
    <Section
      id="layout"
      title="Layout"
      description="TableLayout frames play: a slim top bar, a tool rail, the stage, a dock you can resize or hide, and an action bar. Below 1100 px the dock becomes a drawer."
    >
      <Specimen
        title="Table layout"
        note="Drag the dock edge, or focus it and press the arrow keys. Enter hides the dock."
        wide
        plain
      >
        <KitTableMock />
        <Caption>
          Open <a href="#/kit/table">the table layout on its own</a> to see it at full size.
        </Caption>
      </Specimen>
      <Grid min={360}>
        <Specimen title="Wordmark">
          <Stack gap="lg">
            <Wordmark size="xl" />
            <Row gap="lg" align="end">
              <Wordmark size="lg" />
              <Wordmark size="md" />
              <Wordmark size="sm" />
              <Wordmark size="md" markOnly />
            </Row>
          </Stack>
        </Specimen>
        <Specimen
          title="Page layout"
          note="For home, the lobby, and settings. Faint graph paper under a candle glow."
          plain
        >
          <div className={styles.pagePreview}>
            <PageLayout width="narrow" headerActions={<Avatar name="Sam Hale" color="saffron" size="sm" />}>
              <Stack gap="md">
                <h3 className={styles.pageTitle}>Join a table</h3>
                <p className={styles.muted}>Ruth invited you to Thursday at the Drowned Bell.</p>
                <Card padding="sm">
                  <Row>
                    <Button variant="primary" icon="arrow-right">
                      Join as Sam
                    </Button>
                    <Button variant="ghost">Use another name</Button>
                  </Row>
                </Card>
              </Stack>
            </PageLayout>
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}
