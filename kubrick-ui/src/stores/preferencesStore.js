import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePreferencesStore = create(
    persist(
        (set, get) => ({
            recorderName: '',
            metadata: {},
            defaultQuality: '480p',

            setRecorderName: (name) => set({ recorderName: name }),
            setMetadata: (metadata) => set({ metadata }),
            setMetadataField: (key, value) => set({ metadata: { ...get().metadata, [key]: value } }),
            clearMetadata: () => set({ metadata: {} }),
            setDefaultQuality: (quality) => set({ defaultQuality: quality }),

            reset: () => set({ recorderName: '', metadata: {}, defaultQuality: '480p' }),
        }),
        {
            name: 'kubrick-preferences',
        }
    )
);
