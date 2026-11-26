// The character: two eyes inside a thin ring. It receives a state and animates it;
// it knows nothing about the conversation (docs/personaje/jarvis.md §3).
//
// Every moving part is a shared value read on the UI thread, so a change of state or
// level never re-renders per frame. With "reduce motion" on, nothing sweeps or pulses:
// the eyes still change shape and the ring still changes color.

import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import { jarvisMetrics } from '../jarvis-theme'
import { characterLookFor } from './character-look'
import {
  BLINK_CLOSE_MS,
  BLINK_OPEN_MS,
  BREATHING_PERIOD_MS,
  clampMicrophoneLevel,
  EYE_CLOSED_SCALE,
  eyePoseFor,
  eyesBlink,
  LISTENING_SPIN_PERIOD_MS,
  nextBlinkDelayMs,
  POSE_CHANGE_MS,
  ringIsDashed,
  SPEECH_BEAT_PERIOD_MS,
  SWEEP_PERIOD_MS,
  breathingScale,
  speechBeatScale,
  type JarvisCharacterActivity
} from './character-motion'
import { JarvisEyes } from './JarvisEyes'
import { JarvisRing } from './JarvisRing'

export interface JarvisCharacterProps {
  activity: JarvisCharacterActivity
  /** Microphone level, 0 to 1. Undefined when none is measured; the arcs then rest. */
  level?: number
  /** Side of the square the character is drawn in. */
  size?: number
  /** The sentence being read aloud. Each new value restarts the beat, so the ring beats per phrase. */
  phrase?: string | null
}

const LINEAR = Easing.linear
const SETTLE = Easing.out(Easing.cubic)
// Why a floor: a streamed status can change many times a second and the ring cannot beat that fast.
const MIN_PHRASE_BEAT_GAP_MS = 600

export function JarvisCharacter({
  activity,
  level,
  size = jarvisMetrics.characterSize,
  phrase = null
}: JarvisCharacterProps) {
  const reduceMotion = useReducedMotion()
  const pose = eyePoseFor(activity)
  const look = characterLookFor(activity)
  const blinks = eyesBlink(activity)
  const pulses = !reduceMotion && (activity === 'idle' || activity === 'speaking')

  const openness = useSharedValue(pose.openness)
  const gazeX = useSharedValue(pose.gazeX)
  const gazeY = useSharedValue(pose.gazeY)
  const blink = useSharedValue(1)
  const phase = useSharedValue(0)
  const orbit = useSharedValue(0)
  const sweep = useSharedValue(0)
  const levelSmooth = useSharedValue(clampMicrophoneLevel(level))
  const lastPhraseBeatAt = useRef(0)

  // The eyes settle into the pose of the new state instead of jumping into it.
  useEffect(() => {
    const config = { duration: POSE_CHANGE_MS, easing: SETTLE }
    openness.value = withTiming(pose.openness, config)
    gazeX.value = withTiming(pose.gazeX, config)
    gazeY.value = withTiming(pose.gazeY, config)
  }, [pose.openness, pose.gazeX, pose.gazeY, openness, gazeX, gazeY])

  // Why zeroed first: a repeat starts from wherever the value is, and a beat must begin at rest.
  const startPulse = (): void => {
    cancelAnimation(phase)
    phase.value = 0
    phase.value = withRepeat(withTiming(1, { duration: beatPeriod(activity), easing: LINEAR }), -1)
  }

  useEffect(() => {
    if (pulses) {
      startPulse()
    } else {
      cancelAnimation(phase)
      phase.value = 0
    }
  }, [activity, pulses, phase])

  useEffect(() => {
    if (activity !== 'speaking' || reduceMotion || phrase === null) {
      return
    }
    const now = Date.now()
    if (now - lastPhraseBeatAt.current < MIN_PHRASE_BEAT_GAP_MS) {
      return
    }
    lastPhraseBeatAt.current = now
    startPulse()
  }, [phrase, activity, reduceMotion, phase])

  useEffect(() => {
    if (!blinks) {
      cancelAnimation(blink)
      blink.value = 1
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = (): void => {
      timer = setTimeout(() => {
        blink.value = withSequence(
          withTiming(EYE_CLOSED_SCALE, {
            duration: BLINK_CLOSE_MS,
            easing: Easing.in(Easing.quad)
          }),
          withTiming(1, { duration: BLINK_OPEN_MS, easing: Easing.out(Easing.quad) })
        )
        schedule()
      }, nextBlinkDelayMs())
    }
    schedule()
    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      cancelAnimation(blink)
      blink.value = 1
    }
  }, [blinks, blink])

  const running = (active: boolean): boolean => active && !reduceMotion

  useEffect(() => {
    cancelAnimation(orbit)
    orbit.value = 0
    if (running(activity === 'listening')) {
      orbit.value = withRepeat(
        withTiming(1, { duration: LISTENING_SPIN_PERIOD_MS, easing: LINEAR }),
        -1
      )
    }
  }, [activity, reduceMotion, orbit])

  useEffect(() => {
    cancelAnimation(sweep)
    sweep.value = 0
    if (running(activity === 'thinking')) {
      sweep.value = withRepeat(withTiming(1, { duration: SWEEP_PERIOD_MS, easing: LINEAR }), -1)
    }
  }, [activity, reduceMotion, sweep])

  useEffect(() => {
    levelSmooth.value = withTiming(clampMicrophoneLevel(level), { duration: 90 })
  }, [level, levelSmooth])

  useEffect(
    () => () => {
      for (const value of [openness, gazeX, gazeY, blink, phase, orbit, sweep, levelSmooth]) {
        cancelAnimation(value)
      }
    },
    [openness, gazeX, gazeY, blink, phase, orbit, sweep, levelSmooth]
  )

  const pulse = useAnimatedStyle(() => ({
    transform: [
      {
        scale: activity === 'speaking' ? speechBeatScale(phase.value) : breathingScale(phase.value)
      }
    ]
  }))

  return (
    <View testID="jarvis-character" accessible={false} style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, pulse]}>
        <JarvisRing
          look={look}
          size={size}
          orbit={activity === 'listening' ? orbit : null}
          level={levelSmooth}
          sweep={running(activity === 'thinking') ? sweep : null}
          dashed={ringIsDashed(activity)}
        />
      </Animated.View>
      <JarvisEyes
        openness={openness}
        blink={blink}
        gazeX={gazeX}
        gazeY={gazeY}
        color={look.eye}
        size={size}
      />
    </View>
  )
}

function beatPeriod(activity: JarvisCharacterActivity): number {
  return activity === 'speaking' ? SPEECH_BEAT_PERIOD_MS : BREATHING_PERIOD_MS
}
