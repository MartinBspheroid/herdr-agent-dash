/** Responsive layout class used to keep the board legible across terminal widths. */
export type BoardLayout = 'compact' | 'standard' | 'wide';

/** Select the layout class required by the PRD width breakpoints. */
export function layoutForWidth(width: number): BoardLayout {
  if (width < 90) return 'compact';
  if (width < 140) return 'standard';
  return 'wide';
}
