import './cleanup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/Tabs';

function Dock() {
  return (
    <Tabs defaultValue="party">
      <TabsList aria-label="Dock">
        <TabsTrigger value="party" icon="users">
          Party
        </TabsTrigger>
        <TabsTrigger value="feed" icon="feed" count={3}>
          Feed
        </TabsTrigger>
        <TabsTrigger value="referee" disabled>
          Referee
        </TabsTrigger>
        <TabsTrigger value="journal">Journal</TabsTrigger>
      </TabsList>
      <TabsContent value="party">Party panel</TabsContent>
      <TabsContent value="feed">Feed panel</TabsContent>
      <TabsContent value="referee">Referee panel</TabsContent>
      <TabsContent value="journal">Journal panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('moves between tabs with the arrow keys, skipping disabled tabs and wrapping', async () => {
    const user = userEvent.setup();
    render(<Dock />);
    const party = screen.getByRole('tab', { name: 'Party' });
    expect(party).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Party panel');

    await user.tab();
    expect(party).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    const feed = screen.getByRole('tab', { name: /Feed/ });
    expect(feed).toHaveFocus();
    expect(feed).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Feed panel');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Journal' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(party).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Journal' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(party).toHaveFocus();
  });

  it('labels the unread count', () => {
    render(<Dock />);
    expect(screen.getByLabelText('3 new')).toBeInTheDocument();
  });
});
