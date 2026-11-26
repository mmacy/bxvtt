import { describe, expect, it } from 'vitest';
import { memberClassName } from './display';

describe('memberClassName', () => {
  it('reads the class from the view, and from the catalog only when the view is silent', () => {
    expect(memberClassName({ class_id: 'hollow_knight', class_name: 'Hollow knight' })).toBe('Hollow knight');
    expect(memberClassName({ class_id: 'magic_user', class_name: '' })).toBe('Magic-User');
  });
});
