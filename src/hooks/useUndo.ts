import { useState, useCallback } from 'react';
import type { ShiftSchedule } from '../types';

interface UndoState {
    schedule: ShiftSchedule;
    timestamp: number;
    description: string;
}

const MAX_UNDO_STACK = 10;

export function useUndo(
    schedule: ShiftSchedule,
    setSchedule: (schedule: ShiftSchedule) => void,
    onSave: (schedule: ShiftSchedule) => void
) {
    const [undoStack, setUndoStack] = useState<UndoState[]>([]);
    const [redoStack, setRedoStack] = useState<UndoState[]>([]);

    // Push current state to undo stack before making changes
    const pushUndo = useCallback((description: string) => {
        const state: UndoState = {
            schedule: JSON.parse(JSON.stringify(schedule)),
            timestamp: Date.now(),
            description,
        };
        setUndoStack((prev) => [...prev.slice(-MAX_UNDO_STACK + 1), state]);
        setRedoStack([]); // Clear redo stack on new action
        return state;
    }, [schedule]);

    // Undo last action
    const undo = useCallback(() => {
        if (undoStack.length === 0) return null;

        const prevState = undoStack[undoStack.length - 1];

        // Push current to redo stack
        setRedoStack((prev) => [...prev, {
            schedule: JSON.parse(JSON.stringify(schedule)),
            timestamp: Date.now(),
            description: 'Redo',
        }]);

        // Pop from undo stack
        setUndoStack((prev) => prev.slice(0, -1));

        // Apply previous state
        setSchedule(prevState.schedule);
        onSave(prevState.schedule);

        return prevState;
    }, [undoStack, schedule, setSchedule, onSave]);

    // Redo last undone action
    const redo = useCallback(() => {
        if (redoStack.length === 0) return null;

        const nextState = redoStack[redoStack.length - 1];

        // Push current to undo stack
        setUndoStack((prev) => [...prev, {
            schedule: JSON.parse(JSON.stringify(schedule)),
            timestamp: Date.now(),
            description: 'Undo',
        }]);

        // Pop from redo stack
        setRedoStack((prev) => prev.slice(0, -1));

        // Apply next state
        setSchedule(nextState.schedule);
        onSave(nextState.schedule);

        return nextState;
    }, [redoStack, schedule, setSchedule, onSave]);

    // Create undo function for a specific change
    const createUndoAction = useCallback((description: string) => {
        const prevState = pushUndo(description);
        return () => {
            setSchedule(prevState.schedule);
            onSave(prevState.schedule);
            setUndoStack((prev) => prev.slice(0, -1));
        };
    }, [pushUndo, setSchedule, onSave]);

    return {
        pushUndo,
        undo,
        redo,
        createUndoAction,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoCount: undoStack.length,
        redoCount: redoStack.length,
    };
}
