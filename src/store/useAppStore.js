import { create } from 'zustand'

export const useAppStore = create((set) => ({
  // Selection
  selectedZone: null,
  selectedMuscle: null,
  severity: 'mild',

  // UI
  panelOpen: false,
  cameraPosition: 'default',

  // Strava
  stravaConnected: false,
  stravaToken: null,
  activities: [],
  riskScores: {},

  // Actions
  selectZone: (zoneId) => set({
    selectedZone: zoneId,
    selectedMuscle: null,
    panelOpen: false,
    cameraPosition: zoneId ?? 'default',
  }),

  selectMuscle: (muscleId) => set({
    selectedMuscle: muscleId,
    panelOpen: true,
  }),

  setSeverity: (level) => set({ severity: level }),

  closePanel: () => set({
    panelOpen: false,
    selectedMuscle: null,
  }),

  resetSelection: () => set({
    selectedZone: null,
    selectedMuscle: null,
    panelOpen: false,
    cameraPosition: 'default',
  }),

  connectStrava: (token) => set({
    stravaConnected: true,
    stravaToken: token,
  }),

  disconnectStrava: () => set({
    stravaConnected: false,
    stravaToken: null,
    activities: [],
    riskScores: {},
  }),

  setActivities: (data) => set({ activities: data }),

  setRiskScores: (scores) => set({ riskScores: scores }),
}))