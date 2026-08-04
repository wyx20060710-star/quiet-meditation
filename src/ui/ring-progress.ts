const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * A negative offset opens the gap from twelve o'clock in the SVG path's
 * clockwise direction, so the remaining-time arc recedes clockwise.
 */
export function clockwiseRemainingDashOffset(remainingRatio: number, circumference: number): number {
  return -circumference * (1 - clamp(remainingRatio));
}
