import type { Staff, ShiftSchedule, Holiday, ShiftPatternId, Settings } from '../types';
import { getDaysInMonth, getDayOfWeek, getFormattedDate, isHoliday as checkIsHoliday } from './utils';
import { SHIFT_PATTERNS } from '../types';

export class ShiftGenerator {
    private staff: Staff[];
    private schedule: ShiftSchedule;
    private holidays: Holiday[];
    private settings: Settings;
    private year: number;
    private month: number;
    private daysInMonth: number;

    constructor(staff: Staff[], holidays: Holiday[], year: number, month: number, settings: Settings, currentSchedule: ShiftSchedule = {}) {
        this.staff = staff;
        this.holidays = holidays;
        this.settings = settings;
        this.year = year;
        this.month = month;
        this.daysInMonth = getDaysInMonth(year, month);
        this.schedule = {};

        // Initialize schedule structure with current schedule
        // IMPORTANT: Preserve '有' (Paid Leave) and '振' (Substitute Holiday) exactly as entered
        for (let d = 1; d <= this.daysInMonth; d++) {
            const dateStr = getFormattedDate(year, month, d);
            this.schedule[dateStr] = {};

            for (const s of this.staff) {
                const existingShift = currentSchedule[dateStr]?.[s.id];

                if (s.shiftType === 'part_time') {
                    // Part-time: Preserve ALL manual entries
                    this.schedule[dateStr][s.id] = existingShift ?? '';
                } else {
                    // Regular/Chief/Director/Cooking: Preserve '有' and '振' only
                    if (existingShift === '有' || existingShift === '振') {
                        this.schedule[dateStr][s.id] = existingShift;
                    } else {
                        this.schedule[dateStr][s.id] = '';
                    }
                }
            }
        }
    }

    // Helper: Check if incompatible staff has conflict
    private hasIncompatibleConflict(day: number, staffId: number, shift: ShiftPatternId): boolean {
        const staff = this.staff.find(s => s.id === staffId);
        if (!staff || !staff.incompatibleWith.length) return false;

        const dateStr = getFormattedDate(this.year, this.month, day);
        for (const incompatibleId of staff.incompatibleWith) {
            const incompatibleShift = this.schedule[dateStr]?.[incompatibleId];
            if (incompatibleShift === shift) return true;
        }
        return false;
    }

    // Helper: Check if early shift limit is exceeded
    private isEarlyShiftLimitExceeded(staffId: number): boolean {
        const staff = this.staff.find(s => s.id === staffId);
        if (!staff || staff.earlyShiftLimit === null) return false;

        let count = 0;
        for (let d = 1; d <= this.daysInMonth; d++) {
            const shift = this.getShift(d, staffId);
            if (shift === 'A' || shift === 'B') count++;
        }
        return count >= staff.earlyShiftLimit;
    }

    // Helper: Check consecutive shift violation (A->A, J->J)
    private checkConsecutiveShiftViolation(day: number, staffId: number, shift: ShiftPatternId): boolean {
        const prevDay = this.getPreviousWorkDay(day);
        if (prevDay === 0) return false;

        const prevShift = this.getShift(prevDay, staffId);
        if (shift === 'A' && prevShift === 'A') return true;
        if (shift === 'J' && prevShift === 'J') return true;

        return false;
    }

    public generate(): ShiftSchedule {
        this.phase1_Director();
        this.phase2_Chief();
        this.phase2_5_Cooking();
        this.phase3_Saturday();
        this.phase4_RegularWeekday();
        this.phase4_5_LateShiftCoverage();
        this.phase5_PartTime();
        this.phase6_MinCountAdjustment();
        this.phase7_ChiefBackup();
        this.phase8_CompensatoryOff();
        this.phase9_FillEmpty();
        this.phase10_Validation();

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
                if (!shift) {
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

        // CRITICAL: Never overwrite '有' (Paid Leave) or '振' (Substitute Holiday)
        if (current === '有' || current === '振') {
            return; // Absolutely protected
        }

        // Safety: Do not overwrite part-timer's manual shifts (except empty or 休)
        const staff = this.staff.find(s => s.id === staffId);
        if (staff?.shiftType === 'part_time' && current !== '' && current !== '休') {
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

    // Helper: Count working staff on a day (excluding cooking)
    private countWorkingStaff(day: number): number {
        const dateStr = getFormattedDate(this.year, this.month, day);
        let count = 0;
        this.staff.forEach(s => {
            if (s.shiftType === 'cooking' || s.position === '園長') return;
            const shift = this.schedule[dateStr]?.[s.id];
            if (shift && shift !== '休' && shift !== '振' && shift !== '有') {
                count++;
            }
        });
        return count;
    }

    // Helper: Count specific pattern on a day
    private countPattern(day: number, pattern: ShiftPatternId): number {
        const dateStr = getFormattedDate(this.year, this.month, day);
        let count = 0;
        this.staff.forEach(s => {
            if (this.schedule[dateStr]?.[s.id] === pattern) {
                count++;
            }
        });
        return count;
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

    // Phase 2.5: Cooking Staff
    private phase2_5_Cooking() {
        const cooks = this.staff.filter(s => s.shiftType === 'cooking');
        if (cooks.length === 0) return;

        let saturdayIndex = 0;

        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d)) {
                cooks.forEach(c => this.setShift(d, c.id, '休'));
            } else if (this.isSaturday(d)) {
                const workingCookIndex = saturdayIndex % cooks.length;
                cooks.forEach((c, idx) => {
                    if (idx === workingCookIndex) {
                        this.setShift(d, c.id, 'B');
                    } else {
                        this.setShift(d, c.id, '休');
                    }
                });
                saturdayIndex++;
            } else {
                cooks.forEach(c => this.setShift(d, c.id, 'B'));
            }
        }
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
        // Note: Chief (主任) is included if they have qualification (usually yes)
        const qualifiedRegulars = this.staff.filter(s =>
            s.hasQualification &&
            s.shiftType === 'regular' && // Only Regulars for auto-assignment
            s.position !== '園長'
        );

        const satCounts: Record<number, number> = {};
        this.staff.forEach(s => satCounts[s.id] = 0);

        saturdays.forEach(day => {
            // 1. Count existing Part-time staff (Manual inputs)
            let partTimeCount = 0;
            this.staff.forEach(s => {
                if (s.shiftType === 'part_time') {
                    const shift = this.getShift(day, s.id);
                    if (shift && shift !== '休' && shift !== '振' && shift !== '有') {
                        partTimeCount++;
                    }
                }
            });

            // 2. Calculate how many Regulars are needed
            const targetRegularCount = Math.max(0, 3 - partTimeCount);

            // 3. Select Regulars
            // Sort qualified regulars by Saturday count (ascending)
            // Shuffle first for fairness
            const candidates = [...qualifiedRegulars]
                .sort(() => Math.random() - 0.5)
                .sort((a, b) => satCounts[a.id] - satCounts[b.id]);

            // Pick top N
            const selected = candidates.slice(0, targetRegularCount);

            // Assign selected shift pattern to selected Regulars
            const saturdayPattern = this.settings.saturdayShiftPattern;
            selected.forEach(s => {
                this.setShift(day, s.id, saturdayPattern);
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
                    const transferCount = this.countPattern(targetDay, '振');
                    const paidLeaveCount = this.countPattern(targetDay, '有');
                    const totalOffCount = transferCount + paidLeaveCount;

                    if (totalOffCount < minOffCount) {
                        minOffCount = totalOffCount;
                        bestDay = targetDay;
                    }
                }

                if (bestDay !== -1) {
                    this.setShift(bestDay, s.id, '振');
                }
            });

            // Assign Off to others (excluding Director/Cooking/Part-time)
            this.staff.forEach(s => {
                if (s.position === '園長' || s.shiftType === 'cooking' || s.shiftType === 'part_time') return;
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
            if (this.getShift(d, staffId) === pattern) {
                count++;
            }
        }
        return count;
    }

    // Helper: Check if staff has already worked A or J in the current week (Mon-Sat)
    private hasWeeklyAJLimitConflict(day: number, staffId: number): boolean {
        const date = new Date(this.year, this.month - 1, day);
        const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

        // If Sunday (0), we usually don't assign regular shifts, but just in case
        if (dayOfWeek === 0) return false;

        // Calculate start of week (Monday)
        // Mon(1) -> offset 0. Sat(6) -> offset 5.
        const startOfWeek = day - (dayOfWeek - 1);

        let count = 0;
        for (let d = startOfWeek; d < day; d++) {
            if (d < 1) continue; // Previous month
            const shift = this.getShift(d, staffId);
            if (shift === 'A' || shift === 'J') {
                count++;
            }
        }
        return count >= 1;
    }

    // Phase 4: Regular Staff Weekday
    private phase4_RegularWeekday() {
        const regulars = this.staff.filter(s => s.shiftType === 'regular');

        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d) || this.isSaturday(d)) continue;

            const dateStr = getFormattedDate(this.year, this.month, d);
            const assignedIds = new Set<number>();
            const isAssigned = (id: number) => this.schedule[dateStr][id] !== '' || assignedIds.has(id);

            // Get day of week (1=Mon, 5=Fri)
            const dayOfWeek = new Date(this.year, this.month - 1, d).getDay();

            // Helper to count existing shifts (including part-timers)
            const countExistingPattern = (pattern: ShiftPatternId): number => {
                let count = 0;
                this.staff.forEach(s => {
                    if (this.schedule[dateStr]?.[s.id] === pattern) {
                        count++;
                    }
                });
                return count;
            };

            // Helper to assign pattern with dynamic constraint relaxation
            const assignPattern = (pattern: ShiftPatternId, targetCount: number, relaxConstraints: boolean = false, sortFn?: (a: Staff, b: Staff) => number) => {
                // Count existing (including part-timers)
                const existingCount = countExistingPattern(pattern);
                const neededCount = Math.max(0, targetCount - existingCount);

                if (neededCount === 0) return; // Already satisfied by part-timers

                const candidates = regulars.filter(s => !isAssigned(s.id));

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

                    // Constraints
                    if (pattern === 'A') {
                        if (this.isEarlyShiftLimitExceeded(s.id)) continue;
                        if (this.checkConsecutiveShiftViolation(d, s.id, 'A')) continue;
                        // Weekly A/J limit - skip if relaxConstraints is false, allow if true
                        if (!relaxConstraints && this.hasWeeklyAJLimitConflict(d, s.id)) continue;
                        const prevDay = this.getPreviousWorkDay(d);
                        if (prevDay > 0 && this.getShift(prevDay, s.id) === 'J') continue;
                    }
                    if (pattern === 'J') {
                        if (this.checkConsecutiveShiftViolation(d, s.id, 'J')) continue;
                        // Weekly A/J limit - skip if relaxConstraints is false, allow if true
                        if (!relaxConstraints && this.hasWeeklyAJLimitConflict(d, s.id)) continue;
                    }
                    if (this.hasIncompatibleConflict(d, s.id, pattern)) continue;

                    this.setShift(d, s.id, pattern);
                    assignedIds.add(s.id);
                    count++;
                }

                // If still not enough, try again with relaxed constraints (allow A/J twice per week)
                if (count < neededCount && !relaxConstraints) {
                    const moreCandidates = regulars.filter(s => !isAssigned(s.id));
                    moreCandidates.sort(sortFn || defaultSort);

                    for (const s of moreCandidates) {
                        if (count >= neededCount) break;

                        // Relaxed constraints - only hard constraints remain
                        if (pattern === 'A') {
                            if (this.isEarlyShiftLimitExceeded(s.id)) continue;
                            if (this.checkConsecutiveShiftViolation(d, s.id, 'A')) continue;
                            const prevDay = this.getPreviousWorkDay(d);
                            if (prevDay > 0 && this.getShift(prevDay, s.id) === 'J') continue;
                        }
                        if (pattern === 'J') {
                            if (this.checkConsecutiveShiftViolation(d, s.id, 'J')) continue;
                        }
                        if (this.hasIncompatibleConflict(d, s.id, pattern)) continue;

                        this.setShift(d, s.id, pattern);
                        assignedIds.add(s.id);
                        count++;
                    }
                }
            };

            // Day-of-week based priority (Mon-Wed: A first, Thu-Fri: J first)
            const sortByPatternCount = (pattern: ShiftPatternId) => (a: Staff, b: Staff) => {
                const diff = this.countTotalShifts(a.id, pattern) - this.countTotalShifts(b.id, pattern);
                if (diff !== 0) return diff;
                return (this.countTotalShifts(a.id, 'A') + this.countTotalShifts(a.id, 'B') + this.countTotalShifts(a.id, 'J')) -
                    (this.countTotalShifts(b.id, 'A') + this.countTotalShifts(b.id, 'B') + this.countTotalShifts(b.id, 'J'));
            };

            if (dayOfWeek >= 1 && dayOfWeek <= 3) {
                // Mon-Wed: Prioritize A first to secure candidates before J→A conflict
                assignPattern('A', 2, false, sortByPatternCount('A'));
                assignPattern('J', 2, false, sortByPatternCount('J'));
            } else {
                // Thu-Fri: Prioritize J first (less impact on next week's A)
                assignPattern('J', 2, false, sortByPatternCount('J'));
                assignPattern('A', 2, false, sortByPatternCount('A'));
            }

            // 3. Assign D (Late) - Min 1
            assignPattern('D', 1, false);

            // 4. Assign E (Late+) - Min 1
            assignPattern('E', 1, false);

            // 5. Assign C (Standard+) - Min 1
            assignPattern('C', 1, false);

            // 6. Assign remaining regular staff to B (or C/D fallback)
            const remaining = regulars.filter(s => !isAssigned(s.id));

            // Sort remaining candidates to distribute burden
            // Sort by total shifts (A+B+J) ascending
            remaining.sort((a, b) => {
                const countA = this.countTotalShifts(a.id, 'A') + this.countTotalShifts(a.id, 'B') + this.countTotalShifts(a.id, 'J');
                const countB = this.countTotalShifts(b.id, 'A') + this.countTotalShifts(b.id, 'B') + this.countTotalShifts(b.id, 'J');
                return countA - countB;
            });


            for (const s of remaining) {
                // Assign B (or C/D/E fallback) to ALL remaining regular staff
                // Do NOT assign 休 automatically - regular staff should work weekdays
                let shift: ShiftPatternId = 'B';
                if (this.isEarlyShiftLimitExceeded(s.id)) {
                    shift = 'C'; // Fallback to C
                }

                if (this.hasIncompatibleConflict(d, s.id, shift)) {
                    if (shift === 'B') shift = 'C';
                    else if (shift === 'C') shift = 'D';
                    else if (shift === 'D') shift = 'E';
                }

                this.setShift(d, s.id, shift);
                assignedIds.add(s.id);
            }
        }
    }


    // Phase 4.5: Late Shift Coverage (Infant/Toddler)
    private phase4_5_LateShiftCoverage() {
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d) || this.isSaturday(d)) continue;

            // Check if we have at least one infant and one toddler role in D, E, J
            const lateShifts = ['D', 'E', 'J'];
            let hasInfant = false;
            let hasToddler = false;

            this.staff.forEach(s => {
                const shift = this.getShift(d, s.id);
                if (lateShifts.includes(shift)) {
                    if (s.role === 'infant') hasInfant = true;
                    if (s.role === 'toddler') hasToddler = true;
                }
            });

            if (!hasInfant) {
                // Find an infant staff currently in B or C and swap to D
                const candidate = this.staff.find(s =>
                    s.role === 'infant' &&
                    ['B', 'C'].includes(this.getShift(d, s.id)) &&
                    !this.hasIncompatibleConflict(d, s.id, 'D')
                );
                if (candidate) this.setShift(d, candidate.id, 'D');
            }

            if (!hasToddler) {
                // Find a toddler staff currently in B or C and swap to D
                const candidate = this.staff.find(s =>
                    s.role === 'toddler' &&
                    ['B', 'C'].includes(this.getShift(d, s.id)) &&
                    !this.hasIncompatibleConflict(d, s.id, 'D')
                );
                if (candidate) this.setShift(d, candidate.id, 'D');
            }
        }
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
            for (const pattern of SHIFT_PATTERNS) {
                const minCount = pattern.minCount;
                let currentCount = this.countPattern(d, pattern.id);

                if (currentCount < minCount) {
                    const candidates = this.staff.filter(s => {
                        const shift = this.getShift(d, s.id);
                        return shift !== '' && shift !== '休' && shift !== '振' && shift !== '有' && shift !== pattern.id && s.shiftType !== 'cooking' && s.shiftType !== 'part_time' && s.position !== '園長';
                    });

                    // Sort candidates by shift count of target pattern
                    candidates.sort((a, b) => this.countTotalShifts(a.id, pattern.id) - this.countTotalShifts(b.id, pattern.id));

                    for (const s of candidates) {
                        if (currentCount >= minCount) break;

                        // Check constraints
                        if (pattern.id === 'A') {
                            if (this.isEarlyShiftLimitExceeded(s.id)) continue;
                            if (this.checkConsecutiveShiftViolation(d, s.id, 'A')) continue;
                            const prevDay = this.getPreviousWorkDay(d);
                            if (prevDay > 0 && this.getShift(prevDay, s.id) === 'J') continue;
                        }
                        if (pattern.id === 'J') {
                            if (this.checkConsecutiveShiftViolation(d, s.id, 'J')) continue;
                        }
                        if (this.hasIncompatibleConflict(d, s.id, pattern.id)) continue;

                        this.setShift(d, s.id, pattern.id);
                        currentCount++;
                    }
                }
            }

            // 2. Check Total Count (Min 8)
            // Loop until we reach 8 or run out of candidates
            while (true) {
                let totalWorking = this.countWorkingStaff(d);
                if (totalWorking >= 8) break;

                const availableStaff = this.staff.filter(s =>
                    this.getShift(d, s.id) === '' &&
                    s.shiftType !== 'cooking' &&
                    s.shiftType !== 'part_time' && // Exclude Part-time from auto-fill
                    s.position !== '園長'
                );

                if (availableStaff.length === 0) break;

                // Sort by total shifts to distribute burden
                availableStaff.sort((a, b) => {
                    const countA = this.countTotalShifts(a.id, 'A') + this.countTotalShifts(a.id, 'B') + this.countTotalShifts(a.id, 'J');
                    const countB = this.countTotalShifts(b.id, 'A') + this.countTotalShifts(b.id, 'B') + this.countTotalShifts(b.id, 'J');
                    return countA - countB;
                });

                const candidate = availableStaff[0];

                // Assign B (or C if constrained)
                let shift: ShiftPatternId = 'B';
                if (this.isEarlyShiftLimitExceeded(candidate.id)) shift = 'C';

                // Check conflicts
                if (this.hasIncompatibleConflict(d, candidate.id, shift)) {
                    if (shift === 'B') shift = 'C';
                    else if (shift === 'C') shift = 'D';
                }

                this.setShift(d, candidate.id, shift);
            }
        }
    }

    // Phase 7: Chief Backup
    private phase7_ChiefBackup() {
        const chief = this.staff.find(s => s.position === '主任');
        if (!chief) return;

        let backupCount = 0;
        const LIMIT = 8;

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

            // Helper: Try to reassign B staff to shortage pattern BEFORE using Chief
            const tryReassignBStaff = (pattern: ShiftPatternId, minCount: number): boolean => {
                const currentCount = this.countPattern(d, pattern);
                if (currentCount >= minCount) return false; // No shortage

                const dateStr = getFormattedDate(this.year, this.month, d);

                // Find B staff who could take this pattern
                const bStaff = this.staff.filter(s => {
                    if (s.position === '園長' || s.position === '主任') return false;
                    if (s.shiftType !== 'regular') return false;
                    const shift = this.schedule[dateStr]?.[s.id];
                    return shift === 'B'; // Only consider B staff
                });

                // Sort by total shifts of target pattern (prefer those with fewer)
                bStaff.sort((a, b) =>
                    this.countTotalShifts(a.id, pattern) - this.countTotalShifts(b.id, pattern)
                );

                for (const s of bStaff) {
                    // Check constraints
                    if (pattern === 'A') {
                        if (this.isEarlyShiftLimitExceeded(s.id)) continue;
                        if (this.checkConsecutiveShiftViolation(d, s.id, 'A')) continue;
                        const prevDay = this.getPreviousWorkDay(d);
                        if (prevDay > 0 && this.getShift(prevDay, s.id) === 'J') continue;
                    }
                    if (pattern === 'J') {
                        if (this.checkConsecutiveShiftViolation(d, s.id, 'J')) continue;
                    }
                    if (this.hasIncompatibleConflict(d, s.id, pattern)) continue;

                    // Reassign from B to shortage pattern
                    this.schedule[dateStr][s.id] = pattern; // Direct assignment to bypass setShift protection
                    return true; // Shortage filled by B staff
                }

                return false; // Couldn't reassign
            };

            // Helper to assign Chief if needed (after trying B reassignment)
            const assignIfShort = (pattern: ShiftPatternId, minCount: number): boolean => {
                // First, try to reassign B staff
                if (tryReassignBStaff(pattern, minCount)) {
                    return false; // Shortage filled by B staff, Chief not needed
                }

                // If still short, use Chief
                if (this.countPattern(d, pattern) < minCount) {
                    // Check constraints for Chief
                    if (pattern === 'A') {
                        const prevDay = this.getPreviousWorkDay(d);
                        if (prevDay > 0 && this.getShift(prevDay, chief.id) === 'J') return false;
                    }
                    this.setShift(d, chief.id, pattern);
                    backupCount++;
                    return true;
                }
                return false;
            };

            // 1. Check A shortage (Critical)
            if (assignIfShort('A', 2)) continue;

            // 2. Check J shortage (Critical)
            if (assignIfShort('J', 2)) continue;

            // 3. Check D shortage
            if (assignIfShort('D', 1)) continue;

            // 4. Check E shortage
            if (assignIfShort('E', 1)) continue;

            // 5. Check C shortage
            if (assignIfShort('C', 1)) continue;

            // 6. Check Total shortage
            const total = this.countWorkingStaff(d);
            if (total < 8) {
                this.setShift(d, chief.id, 'B');
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
                if (shift === undefined || shift === null || shift === '') {
                    this.schedule[dateStr][s.id] = '休';
                }
            }
        }
    }

    // Phase 10: Validation & Fix
    private phase10_Validation() {
        for (let d = 1; d <= this.daysInMonth; d++) {
            if (this.isHoliday(d)) continue;

            const prevDay = this.getPreviousWorkDay(d);
            if (prevDay === 0) continue;

            this.staff.forEach(s => {
                // Skip part-timers - their shifts are manual and should not be changed
                if (s.shiftType === 'part_time') return;

                const prevShift = this.getShift(prevDay, s.id);
                const currShift = this.getShift(d, s.id);

                // 1. J -> A violation
                if (prevShift === 'J' && currShift === 'A') {
                    this.setShift(d, s.id, 'B');
                }

                // 2. A -> A violation
                if (prevShift === 'A' && currShift === 'A') {
                    this.setShift(d, s.id, 'B');
                }

                // 3. J -> J violation
                if (prevShift === 'J' && currShift === 'J') {
                    this.setShift(d, s.id, 'B'); // Or D/E?
                }
            });
        }
    }
}
