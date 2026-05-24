import type { ConstraintViolation } from './constraintChecker';

const BLOCKING_LEAVE_CODES = new Set<ConstraintViolation['code']>([
  'SUMMER_LEAVE_LIMIT',
  'SUMMER_LEAVE_MONTH',
]);

export const alertBlockingLeaveViolation = (violations: ConstraintViolation[]): boolean => {
  const blockingViolations = violations.filter(v => v.type === 'hard' && BLOCKING_LEAVE_CODES.has(v.code));
  if (blockingViolations.length === 0) return false;
  window.alert(blockingViolations.map(v => v.message).join('\n'));
  return true;
};
