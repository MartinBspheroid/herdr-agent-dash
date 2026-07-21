/** Responsive layout class used to keep the board legible across terminal widths. */
export type BoardLayout = 'compact' | 'standard' | 'wide';

/** Select the layout class required by the PRD width breakpoints. */
export function layoutForWidth(width: number, forceCompact = false): BoardLayout {
  if (forceCompact) return 'compact';
  if (width < 90) return 'compact';
  if (width < 140) return 'standard';
  return 'wide';
}

/** Map the persisted detail position to OpenTUI's stable flex direction. */
export function contentDirection(position: 'horizontal' | 'vertical'): 'row' | 'column' {
  return position === 'vertical' ? 'column' : 'row';
}
