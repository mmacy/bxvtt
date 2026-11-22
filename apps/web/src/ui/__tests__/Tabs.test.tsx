import './cleanup';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/Tabs';
import { Dock as KitDock } from '../layout/TableLayout';

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

  it('hides an inactive kept-mounted panel and keeps its state', async () => {
    const user = userEvent.setup();
    function Counter() {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(count + 1)}>Clicked {count}</button>;
    }
    render(
      <Tabs defaultValue="feed">
        <TabsList aria-label="Dock">
          <TabsTrigger value="party">Party</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
        </TabsList>
        <TabsContent value="party">Party panel</TabsContent>
        <TabsContent value="feed" keepMounted>
          <Counter />
        </TabsContent>
      </Tabs>,
    );
    await user.click(screen.getByRole('button', { name: 'Clicked 0' }));
    await user.click(screen.getByRole('tab', { name: 'Party' }));
    const kept = screen.getByText('Clicked 1');
    expect(kept).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clicked 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Party panel');
    await user.click(screen.getByRole('tab', { name: 'Feed' }));
    expect(screen.getByRole('button', { name: 'Clicked 1' })).toBeVisible();
  });

  it('keeps the focus ring off a clicked tab and back on for the keyboard', () => {
    render(<Dock />);
    const feed = screen.getByRole('tab', { name: /Feed/ });
    fireEvent.pointerDown(feed);
    expect(feed).toHaveAttribute('data-pointer-focus');
    fireEvent.keyDown(feed, { key: 'ArrowRight' });
    expect(feed).not.toHaveAttribute('data-pointer-focus');
  });
});

describe('Dock', () => {
  it('keeps a tab mounted when it asks to', async () => {
    const user = userEvent.setup();
    render(
      <KitDock
        tabs={[
          { value: 'party', label: 'Party', icon: 'users', content: <p>Marching order</p> },
          { value: 'feed', label: 'Feed', icon: 'feed', content: <p>Feed rows</p>, keepMounted: true },
          { value: 'journal', label: 'Journal', icon: 'journal', content: <p>Notes</p> },
        ]}
      />,
    );
    expect(screen.getByText('Feed rows')).not.toBeVisible();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Feed' }));
    expect(screen.getByText('Feed rows')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(screen.getByText('Feed rows')).not.toBeVisible();
    expect(screen.queryByText('Marching order')).not.toBeInTheDocument();
  });
});
