import { create } from 'zustand';

export const useRecordingStore = create((set) => ({
    status: 'idle', // 'idle' | 'recording' | 'paused' | 'stopped' | 'uploading'
    recordingId: null,
    duration: 0,
    error: null,

    // Actions
    startRecording: (recordingId) => set({ status: 'recording', recordingId, error: null, duration: 0 }),

    pauseRecording: () => set({ status: 'paused' }),

    resumeRecording: () => set({ status: 'recording' }),

    stopRecording: () => set({ status: 'stopped' }),

    setUploading: () => set({ status: 'uploading' }),

    completeUpload: () => set({ status: 'idle', recordingId: null, duration: 0 }),

    setError: (error) => set({ status: 'idle', error, recordingId: null }),

    updateDuration: (duration) => set({ duration }),

    reset: () => set({ status: 'idle', recordingId: null, duration: 0, error: null }),
}));
