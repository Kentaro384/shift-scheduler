import type { Staff, ShiftSchedule, Holiday, ShiftPatternId, Settings, TimeRangeSchedule, ShiftPatternDefinition, StaffAgeRole } from '../types';
import { getDaysInMonth, getDayOfWeek, getFormattedDate, isHoliday as checkIsHoliday } from './utils';
import { SHIFT_PATTERNS, countsAsFullDayStaffingShift, countsAsStaffingShift, countsForStaffing, getEffectiveWorkShiftId, getStaffAgeGroup, getShiftPatternKind, isCookingStaff, isProtectedShiftId, isTimeRangeStaff, isWorkShiftId, normalizeShiftPatterns, parseHalfDayLeaveShiftId } from '../types';
import { countEffectiveShift, countWorkingStaff as countWorkingStaffUtil } from './shiftCountUtils';
import { canAssignShift, createConstraintContext, type ConstraintCode } from './constraintChecker';

function isManualOnlyStaff(staff: Staff): boolean {
    return isTimeRangeStaff(staff) || isCookingStaff(staff);
}

function parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function parsePatternRange(pattern: ShiftPatternDefinition): { start: number; end: number } | null {
    const [start, end] = pattern.timeRange.split('-');
    if (!start || !end) return null;
    return { start: parseTimeToMinutes(start), end: parseTimeToMinutes(end) };
}

function applyHalfDayLeaveRange(
    range: { start: number; end: number },
    shift: ShiftPatternId | undefined
): { start: number; end: number } | null {
    const halfDayLeave = parseHalfDayLeaveShiftId(shift);
    if (!halfDayLeave) return range;

    const noon = parseTimeToMinutes('12:00');
    if (halfDayLeave.leavePeriod === 'morning') {
        const start = Math.max(range.start, noon);
        return start < range.end ? { start, end: range.end } : null;
    }

    const end = Math.min(range.end, noon);
    return range.start < end ? { start: range.start, end } : null;
}

export class ShiftGenerator {
    private staff: Staff[];
    private schedule: ShiftSchedule;
    private initialSchedule: ShiftSchedule;
    private timeRangeSchedule: TimeRangeSchedule;  // Time-range staff ranges with countAsShifts
    private holidays: Holiday[];
    private settings: Settings;
    private patterns: ShiftPatternDefinition[];
    private manualShifts: ShiftSchedule;
    private year: number;
    private month: number;
    private daysInMonth: number;
    private warnings: string[] = [];

    constructor(staff: Staff[], holidays: Holiday[], year: number, month: number, settings: Settings, currentSchedule: ShiftSchedule = {}, timeRangeSchedule: TimeRangeSchedule = {}, patterns: ShiftPatternDefinition[] = SHIFT_PATTERNS, manualShifts: ShiftSchedule = {}) {
        this.staff = staff;
        this.holidays = holidays;
        this.settings = settings;
        this.patterns = normalizeShiftPatterns(patterns.length > 0 ? patterns : SHIFT_PATTERNS);
        this.year = year;
        this.month = month;
        this.daysInMonth = getDaysInMonth(year, month);
        this.schedule = {};
        this.initialSchedule = currentSchedule;
        this.manualShifts = manualShifts;
        this.timeRangeSchedule = timeRangeSchedule;

        // Initialize schedule structure with current schedule
        // IMPORTANT: Preserve fixed plans such as paid leave, transfer off, outing, and pending status.
        for (let d = 1; d <= this.daysInMonth; d++) {
            const dateStr = getFormattedDate(year, month, d);
            this.schedule[dateStr] = {};

            for (const s of this.staff) {
                const existingShift = currentSchedule[dateStr]?.[s.id];

                if (isManualOnlyStaff(s)) {
                    // Manual-only staff: preserve ALL manual entries
                    this.schedule[dateStr][s.id] = existingShift ?? '';
                } else {
                    const manualDay = (manualShifts[dateStr] || {}) as Record<string | number, ShiftPatternId>;
                    const manualShift = manualDay[s.id] || manualDay[String(s.id)];
                    const isManualShift = existingShift && existingShift === manualShift;
                    const shouldPreserveShift = isManualShift || (isProtectedShiftId(existingShift) && existingShift !== '振' && existingShift !== '出');

                    // Regular/Chief/Director: preserve user-entered cells, but auto-generated transfer offs are cleared.
                    if (shouldPreserveShift) {
                        this.schedule[dateStr][s.id] = existingShift;
                    } else {
                        this.schedule[dateStr][s.id] = '';
                    }
                }
            }
        }
    }

    public getWarnings(): string[] {
        return this.warnings;
    }

    public generate(): ShiftSchedule {
        this.phase1_Director();
        this.phase2_Chief();
        this.phase3_Saturday();
        this.phase4_RegularWeekday();
        this.phase4_5_LateShiftCoverage();
        this.phase5_PartTime();
        this.phase6_MinCountAdjustment();
        this.phase6_5_AgeGroupBalance();
        this.phase7_ChiefBackup();
        this.phase8_CompensatoryOff();
        this.phase9_FillEmpty();
        const fixCount = this.phase10_Validation();

        // Phase 10 may convert edge-shift violations to a fallback shift, which can re-open pattern
        // shortages or late-role coverage gaps. Re-run the adjustment phases once.
        if (fixCount > 0) {
            this.phase4_5_LateShiftCoverage();
            this.phase6_MinCountAdjustment();
            this.phase6_5_AgeGroupBalance();
            this.phase7_ChiefBackup();
        }

        // FINAL SAFETY: Absolutely ensure no empty cells remain
        this.finalSafetyFill();

        return this.schedule;
    }

    // Final safety check - runs after all phases to guarantee no blanks
    private finalSafetyFill() {
        for (let d = 1; d <= this.daysInMonth; d++) {
            const dateStr = getFormattedDate(this.year, this.month, d);

            // Create date entry if missing
            if (!this.schedule[dateStr]) {
                this.schedule[dateStr] = {};
            }

            // Check every staff member
            for (const s of this.staff) {
                const shift = this.schedule[dateStr][s.id];

                // If shift is falsy (undefined, null, empty string, etc.), set to '休'
                // EXCEPTION: manual-only staff should stay as entered.
                if (!shift && !isManualOnlyStaff(s)) {
                    this.schedule[dateStr][s.id] = '休';
                }
            }
        }
    }

    private isHoliday(day: number): boolean {
        const dateStr = getFormattedDate(this.year, this.month, day);
        const dow = getDayOfWeek(this.year, this.month, day);
        return dow === 0 || checkIsHoliday(dateStr, this.holidays);
    }

    private isSaturday(day: number): boolean {
        const dow = getDayOfWeek(this.year, this.month, day);
        return dow === 6 && !this.isHoliday(day); // Saturday but not holiday
    }

    private setShift(day: number, staffId: number, shift: ShiftPatternId) {
        const dateStr = getFormattedDate(this.year, this.month, day);
        if (!this.schedule[dateStr]) this.schedule[dateStr] = {};

        const current = this.schedule[dateStr][staffId];
        const manualDay = (this.manualShifts[dateStr] || {}) as Record<string | number, ShiftPatternId>;
        const manualShift = manualDay[staffId] || manualDay[String(staffId)];

        // CRITICAL: Never overwrite fixed plans or manual shifts preserved during initialization.
        if (isProtectedShiftId(current) || (current && current === manualShift)) {
            return; // Absolutely protected
        }

        // Safety: auto-generation must never touch manual-only staff.
        const staff = this.staff.find(s => s.id === staffId);
        if (staff && isManualOnlyStaff(staff)) {
            return;
        }

        this.schedule[dateStr][staffId] = shift;
    }

    private getShift(day: number, staffId: number): ShiftPatternId {
        const dateStr = getFormattedDate(this.year, this.month, day);
        return this.schedule[dateStr]?.[staffId] || '';
    }

    // Helper: Get previous work day (skipping holidays)
    private getPreviousWorkDay(day: number): number {
        let d = day - 1;
        while (d > 0) {
            if (!this.isHoliday(d)) return d;
            d--;
        }
        return 0; // No previous work day in this month
    }

    // Helper: Count working staff on a day (including part-timers, excluding cooking)
    private countWorkingStaff(day: number): number {
        const dateStr = getFormattedDate(this.year, this.month, day);
        // Use utility function that includes part-timers with timeRangeSchedule
        return countWorkingStaffUtil(this.staff, this.schedule, this.timeRangeSchedule, dateStr);
    }

    // Helper: Count specific pattern on a day (includes qualified part-timers with countAsShifts)
    private countPattern(day: number, pattern: ShiftPatternId, qualifiedOnly: boolean = true): number {
        const dateStr = getFormattedDate(this.year, this.month, day);
        return countEffectiveShift(this.staff, this.schedule, this.timeRangeSchedule, dateStr, pattern, qualifiedOnly);
    }

    private countSchedulePattern(day: number, pattern: ShiftPatternId): number {
        const dateStr = getFormattedDate(this.year, this.month, day);
        return this.staff.reduce((count, s) => (
            this.schedule[dateStr]?.[s.id] === pattern ? count + 1 : count
        ), 0);
    }

    private getWorkPatterns(): ShiftPatternDefinition[] {
        return this.patterns.filter(p => isWorkShiftId(p.id));
    }

    private getTimeOrderedWorkPatterns(): ShiftPatternDefinition[] {
        return [...this.getWorkPatterns()].sort((a, b) => {
            const rangeA = parsePatternRange(a);
            const rangeB = parsePatternRange(b);
            if (!rangeA || !rangeB) return a.id.localeCompare(b.id);
            if (rangeA.start !== rangeB.start) return rangeA.start - rangeB.start;
            return rangeA.end - rangeB.end;
        });
    }

    private isWorkShift(shift: ShiftPatternId | undefined): boolean {
        return isWorkShiftId(shift);
    }

    private getShiftKind(shift: ShiftPatternId | undefined): ReturnType<typeof getShiftPatternKind> {
        return getShiftPatternKind(shift, this.patterns);
    }

    private isOpeningShift(shift: ShiftPatternId | undefined): boolean {
        return this.getShiftKind(shift) === 'opening';
    }

    private isLateCoverageShift(shift: ShiftPatternId | undefined): boolean {
        const kind = this.getShiftKind(shift);
        return kind === 'late' || kind === 'closing';
    }

    private isClosingShift(shift: ShiftPatternId | undefined): boolean {
        return this.getShiftKind(shift) === 'closing';
    }

    private isAgeGroupMorningSensitive(staff: Staff): boolean {
        const ageGroup = getStaffAgeGroup(staff);
        return ageGroup === 'age1' || ageGroup === 'age2';
    }

    private isManualShift(day: number, staffId: number): boolean {
        const dateStr = getFormattedDate(this.year, this.month, day);
        const current = this.getShift(day, staffId);
        const manualDay = (this.manualShifts[dateStr] || {}) as Record<string | number, ShiftPatternId>;
        const manualShift = manualDay[staffId] || manualDay[String(staffId)];
        return !!current && current === manualShift;
    }

    private getFirstPatternByKind(kinds: ReturnType<typeof getShiftPatternKind>[]): ShiftPatternId | undefined {
        return this.getWorkPatterns().find(p => kinds.includes(this.getShiftKind(p.id)))?.id;
    }

    private getMorningSupportShift(): ShiftPatternId {
        return this.getFirstPatternByKind(['opening', 'early', 'standard'])
            ?? this.getFallbackWorkShift();
    }

    private getFallbackWorkShift(): ShiftPatternId {
        return this.getFirstPatternByKind(['standard', 'early'])
            ?? this.patterns.find(p => p.id === 'B')?.id
            ?? this.getWorkPatterns()[0]?.id
            ?? '休';
    }

    private getCoverageSlots(): number[] {
        const ranges = this.getWorkPatterns()
            .map(parsePatternRange)
            .filter((range): range is { start: number; end: number } => !!range);
        if (ranges.length === 0) return [];

        const start = Math.min(...ranges.map(range => range.start));
        const end = Math.max(...ranges.map(range => range.end));
        const slots: number[] = [];
        for (let minute = start; minute < end; minute += 30) {
            slots.push(minute);
        }
        return slots;
    }

    private countCoverageAt(day: number, minute: number): number {
        const dateStr = getFormattedDate(this.year, this.month, day);
        let count = 0;

        for (const s of this.staff) {
            if (!countsForStaffing(s)) continue;

            if (isTimeRangeStaff(s)) {
                const timeRange = this.timeRangeSchedule[dateStr]?.[s.id];
                if (!timeRange) continue;
                const start = parseTimeToMinutes(timeRange.start);
                const end = parseTimeToMinutes(timeRange.end);
                if (minute >= start && minute < end) count++;
                continue;
            }

            const shift = this.getShift(day, s.id);
            if (countsAsFullDayStaffingShift(shift, dateStr)) {
                count++;
                continue;
            }

            const effectiveShift = getEffectiveWorkShiftId(shift);
            const pattern = this.patterns.find(p => p.id === effectiveShift);
            const patternRange = pattern ? parsePatternRange(pattern) : null;
            const range = patternRange ? applyHalfDayLeaveRange(patternRange, shift) : null;
            if (range && minute >= range.start && minute < range.end) count++;
        }

        return count;
    }

    private getCoverageScore(day: number, pattern: ShiftPatternDefinition): number {
        const range = parsePatternRange(pattern);
        if (!range) return 0;

        let score = 0;
        for (const slot of this.getCoverageSlots()) {
            if (slot < range.start || slot >= range.end) continue;
            const currentCoverage = this.countCoverageAt(day, slot);
            score += 1 / (currentCoverage + 1);
        }

        return score;
    }

    private chooseCoveragePattern(staff: Staff, day: number, relaxConstraints = false): ShiftPatternId | undefined {
        const candidates = this.getTimeOrderedWorkPatterns()
            .filter(pattern => this.canAssignByConstraints(staff, day, pattern.id, relaxConstraints));

        if (candidates.length === 0) return undefined;

        return candidates
            .sort((a, b) => {
                const latePenaltyA = this.isAgeGroupMorningSensitive(staff) && this.isLateCoverageShift(a.id) ? 100 : 0;
                const latePenaltyB = this.isAgeGroupMorningSensitive(staff) && this.isLateCoverageShift(b.id) ? 100 : 0;
                const penaltyDiff = latePenaltyA - latePenaltyB;
                if (penaltyDiff !== 0) return penaltyDiff;
                const scoreDiff = this.getCoverageScore(day, b) - this.getCoverageScore(day, a);
                if (scoreDiff !== 0) return scoreDiff;
                const countDiff = this.countTotalShifts(staff.id, a.id) - this.countTotalShifts(staff.id, b.id);
                if (countDiff !== 0) return countDiff;
                return this.getTimeOrderedWorkPatterns().findIndex(p => p.id === a.id)
                    - this.getTimeOrderedWorkPatterns().findIndex(p => p.id === b.id);
            })[0]?.id;
    }

    private isWeekdayAutoAssignable(s: Staff): boolean {
        return s.shiftType === 'regular' && !isManualOnlyStaff(s) && !s.saturdayOnly;
    }

    // Phase 1: Director (always off)
    private phase1_Director() {
        const director = this.staff.find(s => s.position === '園長');
        if (!director) return;

        // Director has no shift - set all days to '休'
        for (let d = 1; d <= this.daysInMonth; d++) {
            this.setShift(d, director.id, '休');
        }
    }

    // Phase 2: Chief (backup)
    private phase2_Chief() {
        const chief = this.staff.find(s => s.position === '主任');
        if (!chief) return;
        // Initialized to empty. Will be filled in Phase 7.
    }

    // Phase 3: Saturday (Regular Staff)
    private phase3_Saturday() {
        // Requirement: Total 3 staff (Regular + Part-time).
        // Part-time shifts are manual and MUST NOT be overwritten.

        const saturdays: number[] = [];
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isSaturday(d)) saturdays.push(d);
        }

        // Filter qualified Regular staff (excluding Director and Cooking)
        const qualifiedRegulars = this.staff.filter(s =>
            s.hasQualification &&
            s.shiftType === 'regular' && // Only Regulars for auto-assignment
            !isManualOnlyStaff(s) &&
            s.position !== '園長'
        );

        const satCounts: Record<number, number> = {};
        this.staff.forEach(s => satCounts[s.id] = 0);
        saturdays.forEach(day => {
            const dateStr = getFormattedDate(this.year, this.month, day);
            qualifiedRegulars.forEach(s => {
                if (this.isWorkShift(this.initialSchedule[dateStr]?.[s.id])) {
                    satCounts[s.id]++;
                }
            });
        });

        saturdays.forEach(day => {
            const dateStr = getFormattedDate(this.year, this.month, day);

            // 1. Count existing manual staff (manual regular shifts and time-range staff)
            let partTimeCount = 0;
            let existingRegularCount = 0;
            this.staff.forEach(s => {
                if (isTimeRangeStaff(s)) {
                    // Check schedule first
                    const shift = this.getShift(day, s.id);
                    if (countsAsStaffingShift(shift, dateStr)) {
                        partTimeCount++;
                        return;
                    }
                    // Also check timeRangeSchedule for time-range staff with ranges set
                    const timeRange = this.timeRangeSchedule[dateStr]?.[s.id];
                    if (timeRange) {
                        partTimeCount++;
                    }
                    return;
                }

                if (!isManualOnlyStaff(s)) {
                    const shift = this.getShift(day, s.id);
                    if (countsAsStaffingShift(shift, dateStr)) {
                        existingRegularCount++;
                    }
                }
            });

            // 2. Calculate how many Regulars are needed (use settings, not hardcoded 3)
            const targetTotal = this.settings.saturdayStaffCount;
            const targetRegularCount = Math.max(0, targetTotal - partTimeCount - existingRegularCount);

            // 3. Select Regulars
            // Sort qualified regulars by Saturday count, with saturdayOnly staff first.
            // Shuffle first for fairness
            const saturdayPattern = this.settings.saturdayShiftPattern;
            const candidates = [...qualifiedRegulars]
                .filter(s => !countsAsStaffingShift(this.getShift(day, s.id), dateStr))
                .filter(s => this.canAssignByConstraints(s, day, saturdayPattern))
                .sort(() => Math.random() - 0.5)
                .sort((a, b) => {
                    if (a.saturdayOnly !== b.saturdayOnly) return a.saturdayOnly ? -1 : 1;
                    return satCounts[a.id] - satCounts[b.id];
                });

            // Pick top N
            const selected = candidates.slice(0, targetRegularCount);

            // Assign selected shift pattern to selected Regulars
            selected.forEach(s => {
                this.setShift(day, s.id, '出');
                satCounts[s.id]++;

                // Assign Compensatory Off ('振') in the same week (Mon-Fri)
                // Weekdays are day-5 (Mon) to day-1 (Fri)
                let bestDay = -1;
                let minOffCount = 999;

                // Try to find the best day (fewest total offs: 振 + 有)
                for (let offset = 5; offset >= 1; offset--) {
                    const targetDay = day - offset;
                    if (targetDay < 1) continue;
                    if (this.isHoliday(targetDay)) continue;

                    // Check if staff already has a shift (e.g. manual '有')
                    const currentShift = this.getShift(targetDay, s.id);
                    if (currentShift !== '' && currentShift !== '休') continue;

                    // Count TOTAL offs on this day (振 + 有) to avoid clustering
                    const transferCount = this.countSchedulePattern(targetDay, '振');
                    const paidLeaveCount = this.countSchedulePattern(targetDay, '有');
                    const totalOffCount = transferCount + paidLeaveCount;

                    if (totalOffCount < minOffCount) {
                        minOffCount = totalOffCount;
                        bestDay = targetDay;
                    }
                }

                if (bestDay !== -1) {
                    this.setShift(bestDay, s.id, '振');
                } else {
                    this.warnings.push(`${this.month}/${day} ${s.name}さんの振休を同一週内に配置できませんでした`);
                }
            });

            // Assign Off to others (excluding Director/manual-only staff)
            this.staff.forEach(s => {
                if (s.position === '園長' || isManualOnlyStaff(s)) return;
                if (!selected.find(sel => sel.id === s.id)) {
                    this.setShift(day, s.id, '休');
                }
            });
        });
    }

    // Helper: Count total shifts of a specific pattern for a staff member
    private countTotalShifts(staffId: number, pattern: ShiftPatternId): number {
        let count = 0;
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (getEffectiveWorkShiftId(this.getShift(d, staffId)) === pattern) {
                count++;
            }
        }
        return count;
    }

    private canAssignByConstraints(staff: Staff, day: number, shift: ShiftPatternId, relaxConstraints = false): boolean {
        const ignoreCodes: ConstraintCode[] = ['FAIRNESS_A', 'FAIRNESS_J'];
        if (relaxConstraints) {
            ignoreCodes.push('WEEKLY_AJ_LIMIT', 'SAME_FLOOR');
        }

        return canAssignShift(
            createConstraintContext(this.schedule, this.staff, this.holidays, this.settings, this.year, this.month, this.patterns),
            day,
            staff.id,
            shift,
            { includeSoft: true, ignoreCodes }
        );
    }

    // Phase 4: Regular Staff Weekday
    private phase4_RegularWeekday() {
        const regulars = this.staff.filter(s => this.isWeekdayAutoAssignable(s));

        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d) || this.isSaturday(d)) continue;

            const dateStr = getFormattedDate(this.year, this.month, d);
            const assignedIds = new Set<number>();
            const isAssigned = (id: number) => this.schedule[dateStr][id] !== '' || assignedIds.has(id);

            // Get day of week (1=Mon, 5=Fri)
            const dayOfWeek = new Date(this.year, this.month - 1, d).getDay();

            // Helper to count existing qualified coverage, including part-time time ranges.
            const countExistingPattern = (pattern: ShiftPatternId): number => {
                return this.countPattern(d, pattern);
            };

            // Helper to assign pattern with dynamic constraint relaxation
            const assignPattern = (pattern: ShiftPatternId, targetCount: number, relaxConstraints: boolean = false, sortFn?: (a: Staff, b: Staff) => number) => {
                // Count existing (including part-timers)
                const existingCount = countExistingPattern(pattern);
                const neededCount = Math.max(0, targetCount - existingCount);

                if (neededCount === 0) return; // Already satisfied by part-timers

                const candidates = regulars.filter(s => !isAssigned(s.id) && this.canAssignByConstraints(s, d, pattern, relaxConstraints));

                // Default sort: Pattern count ascending, then random
                const defaultSort = (a: Staff, b: Staff) => {
                    const diff = this.countTotalShifts(a.id, pattern) - this.countTotalShifts(b.id, pattern);
                    if (diff !== 0) return diff;
                    return Math.random() - 0.5;
                };

                candidates.sort(sortFn || defaultSort);

                let count = 0;
                for (const s of candidates) {
                    if (count >= neededCount) break;

                    this.setShift(d, s.id, pattern);
                    assignedIds.add(s.id);
                    count++;
                }

                // If still not enough, try again with relaxed constraints (allow edge shifts twice per week)
                if (count < neededCount && !relaxConstraints) {
                    const moreCandidates = regulars.filter(s => !isAssigned(s.id) && this.canAssignByConstraints(s, d, pattern, true));
                    moreCandidates.sort(sortFn || defaultSort);

                    for (const s of moreCandidates) {
                        if (count >= neededCount) break;

                        this.setShift(d, s.id, pattern);
                        assignedIds.add(s.id);
                        count++;
                    }
                }
            };

            // Day-of-week based priority (Mon-Wed: A first, Thu-Fri: J first)
            const sortByPatternCount = (pattern: ShiftPatternId) => (a: Staff, b: Staff) => {
                if (this.isLateCoverageShift(pattern)) {
                    const sensitiveDiff = Number(this.isAgeGroupMorningSensitive(a)) - Number(this.isAgeGroupMorningSensitive(b));
                    if (sensitiveDiff !== 0) return sensitiveDiff;
                }
                const diff = this.countTotalShifts(a.id, pattern) - this.countTotalShifts(b.id, pattern);
                if (diff !== 0) return diff;
                const balanceIds = this.getWorkPatterns()
                    .filter(p => ['opening', 'early', 'closing'].includes(this.getShiftKind(p.id) || 'standard'))
                    .map(p => p.id);
                const countA = balanceIds.reduce((sum, id) => sum + this.countTotalShifts(a.id, id), 0);
                const countB = balanceIds.reduce((sum, id) => sum + this.countTotalShifts(b.id, id), 0);
                return countA - countB;
            };

            const openingPatterns = this.getWorkPatterns().filter(p => this.isOpeningShift(p.id));
            const closingPatterns = this.getWorkPatterns().filter(p => this.isClosingShift(p.id));
            const latePatterns = this.getWorkPatterns().filter(p => this.getShiftKind(p.id) === 'late');
            const standardPatterns = this.getWorkPatterns().filter(p => this.getShiftKind(p.id) === 'standard');

            if (dayOfWeek >= 1 && dayOfWeek <= 3) {
                // Mon-Wed: Prioritize opening shifts first to secure candidates before closing→opening conflict
                openingPatterns.forEach(pattern => assignPattern(pattern.id, pattern.minCount, false, sortByPatternCount(pattern.id)));
                closingPatterns.forEach(pattern => assignPattern(pattern.id, pattern.minCount, false, sortByPatternCount(pattern.id)));
            } else {
                // Thu-Fri: Prioritize closing shifts first (less impact on next week's opening shifts)
                closingPatterns.forEach(pattern => assignPattern(pattern.id, pattern.minCount, false, sortByPatternCount(pattern.id)));
                openingPatterns.forEach(pattern => assignPattern(pattern.id, pattern.minCount, false, sortByPatternCount(pattern.id)));
            }

            latePatterns.forEach(pattern => assignPattern(pattern.id, pattern.minCount, false));
            standardPatterns.forEach(pattern => assignPattern(pattern.id, pattern.minCount, false));

            // 6. Assign remaining regular staff to B (or C/D fallback)
            const remaining = regulars.filter(s =>
                !isAssigned(s.id) &&
                this.getWorkPatterns().some(pattern => this.canAssignByConstraints(s, d, pattern.id))
            );

            // Sort remaining candidates to distribute burden across the full time-flow pattern set.
            remaining.sort((a, b) => {
                const balanceIds = this.getTimeOrderedWorkPatterns().map(p => p.id);
                const countA = balanceIds.reduce((sum, id) => sum + this.countTotalShifts(a.id, id), 0);
                const countB = balanceIds.reduce((sum, id) => sum + this.countTotalShifts(b.id, id), 0);
                return countA - countB;
            });


            for (const s of remaining) {
                const shift = this.chooseCoveragePattern(s, d) ?? this.chooseCoveragePattern(s, d, true);
                if (!shift) continue;

                this.setShift(d, s.id, shift);
                assignedIds.add(s.id);
            }
        }
    }


    // Phase 4.5: Keep age-group morning coverage where possible.
    private phase4_5_LateShiftCoverage() {
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d) || this.isSaturday(d)) continue;

            (['age1', 'age2'] as StaffAgeRole[]).forEach(group => {
                if (!this.isAgeGroupMorningThin(d, group)) return;

                if (this.tryMoveAgeGroupLateStaffToMorning(d, group)) return;
                this.tryPlaceChiefForAgeGroupMorning(d);
            });
        }
    }

    private isAgeGroupMorningThin(day: number, group: StaffAgeRole): boolean {
        const groupStaff = this.staff.filter(s =>
            getStaffAgeGroup(s) === group &&
            this.isWorkShift(this.getShift(day, s.id)) &&
            countsForStaffing(s)
        );
        if (groupStaff.length === 0) return false;

        return !groupStaff.some(s => !this.isLateCoverageShift(this.getShift(day, s.id)));
    }

    private tryMoveAgeGroupLateStaffToMorning(day: number, group: StaffAgeRole): boolean {
        const target = this.staff.find(s =>
            getStaffAgeGroup(s) === group &&
            this.isLateCoverageShift(this.getShift(day, s.id)) &&
            !isManualOnlyStaff(s) &&
            !s.saturdayOnly &&
            !this.isManualShift(day, s.id)
        );
        if (!target) return false;

        const morningShift = this.getMorningSupportShift();
        if (this.canAssignByConstraints(target, day, morningShift, true)) {
            this.setShift(day, target.id, morningShift);
            return true;
        }

        const targetShift = this.getShift(day, target.id);
        return this.trySwapLateShiftOutsideAgeGroup(day, group, target, targetShift);
    }

    private tryPlaceChiefForAgeGroupMorning(day: number): boolean {
        const chief = this.staff.find(s => s.position === '主任');
        if (!chief) return false;
        if (this.isManualShift(day, chief.id)) return false;

        const currentShift = this.getShift(day, chief.id);
        if (this.isWorkShift(currentShift) && !this.isLateCoverageShift(currentShift)) return true;
        if (this.isLateCoverageShift(currentShift)) return false;

        const morningShift = this.getMorningSupportShift();
        if (!this.canAssignByConstraints(chief, day, morningShift, true)) return false;

        this.setShift(day, chief.id, morningShift);
        return true;
    }

    // Phase 5: Part-time Staff (Weekday)
    private phase5_PartTime() {
        // User Request: Part-time shifts are manually submitted in advance. Do not change/auto-generate.
        // Since we preserved their shifts in the constructor, we simply do nothing here.
        return;
    }

    // Phase 6: Minimum Count Adjustment
    private phase6_MinCountAdjustment() {
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d) || this.isSaturday(d)) continue;

            // 1. Check specific pattern minimums
            for (const pattern of this.getWorkPatterns()) {
                const minCount = pattern.minCount;
                let currentCount = this.countPattern(d, pattern.id);

                if (currentCount < minCount) {
                    const candidates = this.staff.filter(s => {
                        const shift = this.getShift(d, s.id);
                        return this.isWorkShift(shift) && shift !== pattern.id && !isManualOnlyStaff(s) && s.position !== '園長' && !s.saturdayOnly && this.canAssignByConstraints(s, d, pattern.id);
                    });

                    // Sort candidates by shift count of target pattern
                    candidates.sort((a, b) => {
                        if (this.isLateCoverageShift(pattern.id)) {
                            const sensitiveDiff = Number(this.isAgeGroupMorningSensitive(a)) - Number(this.isAgeGroupMorningSensitive(b));
                            if (sensitiveDiff !== 0) return sensitiveDiff;
                        }
                        return this.countTotalShifts(a.id, pattern.id) - this.countTotalShifts(b.id, pattern.id);
                    });

                    for (const s of candidates) {
                        if (currentCount >= minCount) break;

                        this.setShift(d, s.id, pattern.id);
                        currentCount++;
                    }
                }
            }

            // 2. Check Total Count
            // Loop until we reach the configured weekday minimum or run out of candidates.
            while (true) {
                const totalWorking = this.countWorkingStaff(d);
                if (totalWorking >= this.settings.weekdayStaffCount) break;

                const availableStaff = this.staff.filter(s =>
                    this.getShift(d, s.id) === '' &&
                    !isManualOnlyStaff(s) &&
                    s.position !== '園長' &&
                    !s.saturdayOnly &&
                    this.getWorkPatterns().some(pattern => this.canAssignByConstraints(s, d, pattern.id))
                );

                if (availableStaff.length === 0) break;

                // Sort by total shifts to distribute burden
                availableStaff.sort((a, b) => {
                    const balanceIds = this.getTimeOrderedWorkPatterns().map(p => p.id);
                    const countA = balanceIds.reduce((sum, id) => sum + this.countTotalShifts(a.id, id), 0);
                    const countB = balanceIds.reduce((sum, id) => sum + this.countTotalShifts(b.id, id), 0);
                    return countA - countB;
                });

                const candidate = availableStaff[0];

                const shift = this.chooseCoveragePattern(candidate, d) ?? this.chooseCoveragePattern(candidate, d, true);
                if (!shift) break;

                this.setShift(d, candidate.id, shift);
            }
        }
    }

    // Phase 6.5: avoid stacking late/closing shifts within the same age group.
    private phase6_5_AgeGroupBalance() {
        const targetGroups: StaffAgeRole[] = ['age1', 'age2'];
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d) || this.isSaturday(d)) continue;
            targetGroups.forEach(group => this.balanceAgeGroupLateShifts(d, group));
        }
    }

    private balanceAgeGroupLateShifts(day: number, group: StaffAgeRole) {
        const groupStaff = this.staff.filter(s =>
            getStaffAgeGroup(s) === group &&
            this.isWorkShift(this.getShift(day, s.id)) &&
            !isManualOnlyStaff(s) &&
            !s.saturdayOnly
        );
        const lateStaff = groupStaff.filter(s => this.isLateCoverageShift(this.getShift(day, s.id)));
        if (lateStaff.length <= 1) return;

        for (const target of lateStaff.slice(1)) {
            const targetShift = this.getShift(day, target.id);
            if (!this.isLateCoverageShift(targetShift)) continue;

            if (this.trySwapLateShiftOutsideAgeGroup(day, group, target, targetShift)) continue;
            this.tryPlaceChiefForAgeGroupMorning(day);
        }
    }

    private trySwapLateShiftOutsideAgeGroup(day: number, group: StaffAgeRole, target: Staff, targetShift: ShiftPatternId): boolean {
        const candidates = this.staff.filter(s => {
            if (s.id === target.id) return false;
            if (s.position === '主任' || s.position === '園長') return false;
            if (getStaffAgeGroup(s) === group) return false;
            if (!this.isWeekdayAutoAssignable(s)) return false;
            if (this.isManualShift(day, s.id) || this.isManualShift(day, target.id)) return false;

            const candidateShift = this.getShift(day, s.id);
            if (!this.isWorkShift(candidateShift) || this.isLateCoverageShift(candidateShift)) return false;
            return this.canAssignByConstraints(s, day, targetShift, true) &&
                this.canAssignByConstraints(target, day, candidateShift, true);
        });

        candidates.sort((a, b) =>
            this.countTotalShifts(a.id, targetShift) - this.countTotalShifts(b.id, targetShift)
        );

        const swapTarget = candidates[0];
        if (!swapTarget) return false;

        const candidateShift = this.getShift(day, swapTarget.id);
        this.schedule[getFormattedDate(this.year, this.month, day)][target.id] = candidateShift;
        this.schedule[getFormattedDate(this.year, this.month, day)][swapTarget.id] = targetShift;
        return true;
    }

    // Phase 7: Chief Backup
    private phase7_ChiefBackup() {
        const chief = this.staff.find(s => s.position === '主任');
        if (!chief) return;

        let backupCount = 0;
        const LIMIT = this.settings.chiefBackupLimit;
        for (let d = 1; d <= this.daysInMonth; d++) {
            const shift = this.getShift(d, chief.id);
            if (this.isWorkShift(shift)) {
                backupCount++;
            }
        }

        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d)) {
                this.setShift(d, chief.id, '休');
                continue;
            }

            // Skip Saturday for Chief Backup (Strict B=3 rule)
            if (this.isSaturday(d)) continue;

            if (backupCount >= LIMIT) {
                if (this.getShift(d, chief.id) === '') this.setShift(d, chief.id, '休');
                continue;
            }

            // Helper: Try to reassign standard staff to shortage pattern BEFORE using Chief
            const tryReassignStandardStaff = (pattern: ShiftPatternId, minCount: number): boolean => {
                const currentCount = this.countPattern(d, pattern);
                if (currentCount >= minCount) return false; // No shortage

                const dateStr = getFormattedDate(this.year, this.month, d);

                // Find standard/early staff who could take this pattern
                const standardStaff = this.staff.filter(s => {
                    if (s.position === '園長' || s.position === '主任') return false;
                    if (s.shiftType !== 'regular') return false;
                    if (isManualOnlyStaff(s)) return false;
                    if (s.saturdayOnly) return false;
                    if (!this.canAssignByConstraints(s, d, pattern)) return false;
                    const shift = this.schedule[dateStr]?.[s.id];
                    return this.getShiftKind(shift) === 'standard' || this.getShiftKind(shift) === 'early';
                });

                // Sort by total shifts of target pattern (prefer those with fewer)
                standardStaff.sort((a, b) =>
                    this.countTotalShifts(a.id, pattern) - this.countTotalShifts(b.id, pattern)
                );

                for (const s of standardStaff) {
                    // Reassign from standard/early to shortage pattern
                    this.schedule[dateStr][s.id] = pattern; // Direct assignment to bypass setShift protection
                    return true; // Shortage filled by another staff
                }

                return false; // Couldn't reassign
            };

            // Helper to assign Chief if needed (after trying B reassignment)
            const assignIfShort = (pattern: ShiftPatternId, minCount: number): boolean => {
                // First, try to reassign regular staff
                if (tryReassignStandardStaff(pattern, minCount)) {
                    return false; // Shortage filled by regular staff, Chief not needed
                }

                // If still short, use Chief
                if (this.countPattern(d, pattern) < minCount) {
                    const chiefShift = this.getShift(d, chief.id);
                    if (this.isWorkShift(chiefShift) && !this.isLateCoverageShift(chiefShift) && this.isLateCoverageShift(pattern)) return false;

                    // Check constraints for Chief
                    if (this.isOpeningShift(pattern)) {
                        const prevDay = this.getPreviousWorkDay(d);
                        if (prevDay > 0 && this.isClosingShift(this.getShift(prevDay, chief.id))) return false;
                    }
                    this.setShift(d, chief.id, pattern);
                    backupCount++;
                    return true;
                }
                return false;
            };

            const prioritizedPatterns = this.getWorkPatterns().sort((a, b) => {
                const priority = { opening: 0, closing: 1, late: 2, standard: 3, early: 4 };
                return priority[this.getShiftKind(a.id) || 'standard'] - priority[this.getShiftKind(b.id) || 'standard'];
            });

            if (prioritizedPatterns.some(pattern => assignIfShort(pattern.id, pattern.minCount))) continue;

            // 6. Check Total shortage
            const total = this.countWorkingStaff(d);
            if (total < this.settings.weekdayStaffCount) {
                this.setShift(d, chief.id, this.getFallbackWorkShift());
                backupCount++;
                continue;
            }

            // Default to Off
            if (this.getShift(d, chief.id) === '') this.setShift(d, chief.id, '休');
        }
    }

    // Phase 8: Compensatory Off (Moved to Phase 3)
    private phase8_CompensatoryOff() {
        // Logic moved to Phase 3 to ensure immediate assignment in the same week.
        return;
    }

    // Phase 9: Fill Empty - Ensure ALL cells have a value
    private phase9_FillEmpty() {
        for (let d = 1; d <= this.daysInMonth; d++) {
            const dateStr = getFormattedDate(this.year, this.month, d);

            // Ensure the date object exists
            if (!this.schedule[dateStr]) {
                this.schedule[dateStr] = {};
            }

            // For each staff member, ensure they have a shift
            for (const s of this.staff) {
                const shift = this.schedule[dateStr][s.id];
                // Check for undefined, null, or empty string
                // EXCEPTION: manual-only staff should stay as entered.
                if ((shift === undefined || shift === null || shift === '') && !isManualOnlyStaff(s)) {
                    this.schedule[dateStr][s.id] = '休';
                }
            }
        }
    }

    // Phase 10: Validation & Fix
    private phase10_Validation(): number {
        let fixCount = 0;
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d)) continue;

            const prevDay = this.getPreviousWorkDay(d);
            if (prevDay === 0) continue;

            this.staff.forEach(s => {
                // Skip manual-only staff - their shifts should not be changed
                if (isManualOnlyStaff(s)) return;

                const prevShift = this.getShift(prevDay, s.id);
                const currShift = this.getShift(d, s.id);

                // 1. Closing -> opening violation
                if (this.isClosingShift(prevShift) && this.isOpeningShift(currShift)) {
                    this.setShift(d, s.id, this.getFallbackWorkShift());
                    fixCount++;
                }

                // 2. Consecutive opening violation
                if (this.isOpeningShift(prevShift) && this.isOpeningShift(currShift)) {
                    this.setShift(d, s.id, this.getFallbackWorkShift());
                    fixCount++;
                }

                // 3. Consecutive closing violation
                if (this.isClosingShift(prevShift) && this.isClosingShift(currShift)) {
                    this.setShift(d, s.id, this.getFallbackWorkShift());
                    fixCount++;
                }
            });
        }
        return fixCount;
    }
}
