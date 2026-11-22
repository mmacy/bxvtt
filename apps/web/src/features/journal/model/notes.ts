/**
 * The party notes editor as a reducer: the draft, the server version the draft started from, autosave, and what
 * happens when someone else saves first. The component sends the requests. This module decides what to show.
 */
import type { Notes } from '@bxvtt/shared/protocol';

export type NotesStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

export interface NotesState {
  /** What the editor shows. */
  draft: string;
  /** The server document the draft is based on. A save sends its version. */
  base: Notes;
  status: NotesStatus;
  /** The text the save in flight sends. */
  sending: string | null;
  /** Someone else's newer version, while the reader chooses what to keep. */
  theirs: Notes | null;
  /** Shows both versions side by side. */
  comparing: boolean;
  error: string | null;
}

export type NotesAction =
  | { type: 'edit'; text: string }
  | { type: 'remote'; notes: Notes }
  | { type: 'save-start' }
  | { type: 'save-ok'; notes: Notes }
  | { type: 'save-conflict'; notes: Notes }
  | { type: 'save-error'; message: string }
  | { type: 'keep-mine' }
  | { type: 'take-theirs' }
  | { type: 'compare'; on: boolean };

/** The editor's state for a document the reader hasn't touched. */
export function initialNotesState(notes: Notes): NotesState {
  return {
    draft: notes.text,
    base: notes,
    status: 'idle',
    sending: null,
    theirs: null,
    comparing: false,
    error: null,
  };
}

/** Whether the draft has changes the server doesn't have. */
export function hasUnsavedChanges(state: NotesState): boolean {
  return state.draft !== state.base.text;
}

/** Whether autosave should send the draft now. */
export function shouldSave(state: NotesState): boolean {
  return state.status === 'dirty' && hasUnsavedChanges(state);
}

export function notesReducer(state: NotesState, action: NotesAction): NotesState {
  switch (action.type) {
    case 'edit': {
      if (state.status === 'conflict') return { ...state, draft: action.text };
      if (state.status === 'saving') return { ...state, draft: action.text };
      const dirty = action.text !== state.base.text;
      return { ...state, draft: action.text, status: dirty ? 'dirty' : 'saved', error: null };
    }
    case 'remote': {
      const incoming = action.notes;
      if (incoming.version <= state.base.version) return state;
      if (state.status === 'conflict') {
        return state.theirs !== null && incoming.version > state.theirs.version
          ? { ...state, theirs: incoming }
          : state;
      }
      // Our own save comes back on the socket too.
      if (state.sending !== null && incoming.text === state.sending) return state;
      if (!hasUnsavedChanges(state) && state.status !== 'saving') {
        return { ...state, draft: incoming.text, base: incoming, status: 'idle', error: null };
      }
      if (incoming.text === state.draft) return { ...state, base: incoming, status: 'saved' };
      if (state.status === 'saving') return state;
      return { ...state, status: 'conflict', theirs: incoming, comparing: false };
    }
    case 'save-start':
      return { ...state, status: 'saving', sending: state.draft, error: null };
    case 'save-ok': {
      const sent = state.sending ?? action.notes.text;
      const typedSince = state.draft !== sent;
      return {
        ...state,
        base: action.notes,
        sending: null,
        status: typedSince ? 'dirty' : 'saved',
        theirs: null,
        comparing: false,
      };
    }
    case 'save-conflict':
      if (action.notes.text === state.draft) {
        return { ...state, base: action.notes, sending: null, status: 'saved' };
      }
      return { ...state, sending: null, status: 'conflict', theirs: action.notes, comparing: false };
    case 'save-error':
      return { ...state, sending: null, status: 'error', error: action.message };
    case 'keep-mine':
      if (state.theirs === null) return state;
      // Base the draft on their version, so the next save replaces it.
      return { ...state, base: state.theirs, theirs: null, comparing: false, status: 'dirty' };
    case 'take-theirs':
      if (state.theirs === null) return state;
      return {
        ...state,
        draft: state.theirs.text,
        base: state.theirs,
        theirs: null,
        comparing: false,
        status: 'idle',
      };
    case 'compare':
      return { ...state, comparing: action.on };
  }
}
