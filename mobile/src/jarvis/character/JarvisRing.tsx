import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue
} from 'react-native-reanimated'
import { Circle, G, Line, Path, Svg } from 'react-native-svg'
import {
  arcDashProps,
  arcPath,
  CHARACTER_GEOMETRY,
  sweepAngleDeg,
  tickMarks,
  type JarvisTickMark
} from './character-motion'
import type { JarvisCharacterLook } from './character-look'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const { viewbox, center, ringRadius, ringStroke, tickStroke, tickInnerRadius, tickOuterRadius } =
  CHARACTER_GEOMETRY

const TICKS: JarvisTickMark[] = tickMarks()
const COMET_RADIUS = (tickInnerRadius + tickOuterRadius) / 2
// The sweep is a comet: a faint trail with a bright head, drawn on twelve o'clock and turned from there.
const COMET_TRAIL = arcPath(-56, 50, COMET_RADIUS)
const COMET_HEAD = arcPath(-9, 18, COMET_RADIUS)
// Why a hairline dash with round caps: it draws as a row of dots, the "punteado" of the disconnected state.
const DOTTED_RING = [0.01, 7]

interface JarvisRingProps {
  look: JarvisCharacterLook
  size: number
  /** Listening arcs: turns of their slow orbit. Null hides them. */
  orbit: SharedValue<number> | null
  /** Smoothed microphone level, 0 to 1. */
  level: SharedValue<number>
  /** Thinking sweep: turns of the comet. Null hides it. */
  sweep: SharedValue<number> | null
  dashed: boolean
}

interface ListeningArcProps {
  turn: number
  color: string
  level: SharedValue<number>
}

function ListeningArc({ turn, color, level }: ListeningArcProps) {
  const resting = arcDashProps(undefined)
  const animatedProps = useAnimatedProps(() => arcDashProps(level.value))
  return (
    <G rotation={turn} originX={center} originY={center}>
      <AnimatedCircle
        cx={center}
        cy={center}
        r={ringRadius}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeDasharray={resting.strokeDasharray}
        strokeDashoffset={resting.strokeDashoffset}
        strokeWidth={resting.strokeWidth}
        animatedProps={animatedProps}
      />
    </G>
  )
}

export function JarvisRing({ look, size, orbit, level, sweep, dashed }: JarvisRingProps) {
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(orbit?.value ?? 0) * 360}deg` }]
  }))
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweepAngleDeg(sweep?.value ?? 0)}deg` }]
  }))
  const box = { width: size, height: size }
  const canvas = `0 0 ${viewbox} ${viewbox}`

  return (
    <View testID="jarvis-ring" style={box}>
      <Svg width={size} height={size} viewBox={canvas}>
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          fill="none"
          stroke={look.ring}
          strokeWidth={ringStroke}
          strokeLinecap="round"
          strokeDasharray={dashed ? DOTTED_RING : undefined}
        />
        {look.ticks
          ? TICKS.map((tick, index) => (
              <Line
                key={index}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke={look.tick}
                strokeWidth={tickStroke}
                strokeLinecap="round"
              />
            ))
          : null}
      </Svg>
      {orbit ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, orbitStyle]}>
          <Svg width={size} height={size} viewBox={canvas}>
            <ListeningArc turn={0} color={look.arc} level={level} />
            <ListeningArc turn={180} color={look.arc} level={level} />
          </Svg>
        </Animated.View>
      ) : null}
      {sweep ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sweepStyle]}>
          <Svg width={size} height={size} viewBox={canvas}>
            <Path
              d={COMET_TRAIL}
              fill="none"
              stroke={look.sweep}
              strokeWidth={tickStroke + 0.5}
              strokeLinecap="round"
              strokeOpacity={0.28}
            />
            <Path
              d={COMET_HEAD}
              fill="none"
              stroke={look.sweep}
              strokeWidth={tickStroke + 1.5}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}
