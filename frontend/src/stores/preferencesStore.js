import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePreferencesStore = create(
    persist(
        (set) => ({
            recorderName: '',
            eventId: '',
            civId: '',
            aNumber: '',
            defaultQuality: '720p',

            setRecorderName: (name) => set({ recorderName: name }),
            setEventId: (eventId) => set({ eventId }),
            setCivId: (civId) => set({ civId }),
            setANumber: (aNumber) => set({ aNumber }),
            setDefaultQuality: (quality) => set({ defaultQuality: quality }),

            reset: () => set({ recorderName: '', eventId: '', civId: '', aNumber: '', defaultQuality: '720p' }),
        }),
        {
            name: 'kubrick-preferences',
        }
    )
);
