import { createContext, useContext } from 'react'
import type { LockState } from './lock-policy'

// Why a context: the screens stay mounted under the gate while the app is locked (RF-1.3), so
// what runs in them (the conversation engine, first of all) has to know when the app is locked
// to fall silent with it. Only `LockGate` writes it; there is one lock per app.
const LockStateContext = createContext<LockState>('unlocked')

export const LockStateProvider = LockStateContext.Provider

/** `unlocked` where no gate stands above: a screen rendered on its own has no lock to respect. */
export function useLockState(): LockState {
  return useContext(LockStateContext)
}
