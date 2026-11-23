import {
  getApi,
  tokenClass,
  useApiAction,
  useMembers,
  useParty,
  useSeats,
  useTableDetail,
  useTableStoreApi,
  useTableUi,
} from '@/app';
import { Dialog, Field, Select, TokenPortrait } from '@/ui';
import styles from './table.module.css';

const EMPTY = 'empty';

/**
 * The referee's seat management: which player controls each party member, and who the caller is. A referee
 * controls every empty seat.
 */
export function SeatsDialog() {
  const open = useTableUi((s) => s.seatsOpen);
  const setOpen = useTableUi((s) => s.setSeatsOpen);
  const table = useTableDetail();
  const seats = useSeats();
  const party = useParty();
  const members = useMembers();
  const store = useTableStoreApi();
  const { run, pending } = useApiAction();
  if (table === null) return null;

  const memberOptions = [
    { value: EMPTY, label: 'Empty seat (referee controls)' },
    ...members.map((m) => ({
      value: m.user_id,
      label: m.role === 'referee' ? `${m.name} (referee)` : m.name,
    })),
  ];

  const setSeat = (memberId: string, name: string, value: string) =>
    void run(() => getApi().setSeat(table.id, memberId, value === EMPTY ? null : value), {
      success: value === EMPTY ? `${name}'s seat is now empty` : `Assigned ${name}'s seat`,
      errorTitle: `Couldn't change ${name}'s seat`,
    });

  const setCaller = async (value: string) => {
    const result = await run(
      () => getApi().updateTable(table.id, { settings: { caller_user_id: value === EMPTY ? null : value } }),
      { errorTitle: "Couldn't change the caller" },
    );
    if (result.ok) store.getState().receiveTable(result.value);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Seats and caller"
      description="Assign each character to a player. The caller speaks for the party and controls party actions."
      size="md"
    >
      <div className={styles.seats}>
        <Field label="Caller">
          <Select
            value={table.settings.caller_user_id ?? EMPTY}
            disabled={pending}
            options={[
              { value: EMPTY, label: 'No caller' },
              ...members.map((m) => ({ value: m.user_id, label: m.name })),
            ]}
            onValueChange={(value) => void setCaller(value)}
          />
        </Field>
        <ul className={styles.seatList} aria-label="Seats in marching order">
          {seats.map((seat) => {
            const member = party.find((m) => m.id === seat.member_id);
            return (
              <li key={seat.member_id} className={styles.seatRow}>
                <TokenPortrait
                  name={seat.name}
                  characterClass={tokenClass(member?.class_id)}
                  color={members.find((m) => m.user_id === seat.user_id)?.color}
                  size={32}
                  decorative
                />
                <span className={styles.seatName}>{seat.name}</span>
                <Select
                  aria-label={`Who plays ${seat.name}`}
                  value={seat.user_id ?? EMPTY}
                  disabled={pending}
                  options={memberOptions}
                  onValueChange={(value) => setSeat(seat.member_id, seat.name, value)}
                  className={styles.seatSelect}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
