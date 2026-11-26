import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { Ellipse, Svg } from 'react-native-svg'
import { CHARACTER_GEOMETRY, EYE_CLOSED_SCALE } from './character-motion'

const {
  viewbox,
  center,
  eye: { centerX, width: EYE_WIDTH, height: EYE_HEIGHT }
} = CHARACTER_GEOMETRY

// Why taller than the eye: listening opens it past its resting height, and the canvas must not clip it.
const EYE_CANVAS_HEIGHT = EYE_HEIGHT * 1.5

interface JarvisEyesMotion {
  openness: SharedValue<number>
  blink: SharedValue<number>
  gazeX: SharedValue<number>
  gazeY: SharedValue<number>
}

interface JarvisEyesProps extends JarvisEyesMotion {
  color: string
  size: number
}

interface EyeProps extends JarvisEyesProps {
  side: -1 | 1
  testID: string
}

const Eye = ({ side, testID, color, size, openness, blink, gazeX, gazeY }: EyeProps) => {
  const scale = size / viewbox
  const canvasHeight = EYE_CANVAS_HEIGHT * scale
  const motion = useAnimatedStyle(() => ({
    transform: [
      { translateX: (gazeX.value * size) / viewbox },
      { translateY: (gazeY.value * size) / viewbox },
      { scaleY: Math.max(openness.value * blink.value, EYE_CLOSED_SCALE) }
    ]
  }))
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.canvas,
        {
          left: (center + side * centerX) * scale - (EYE_WIDTH * scale) / 2,
          top: center * scale - canvasHeight / 2,
          width: EYE_WIDTH * scale,
          height: canvasHeight
        },
        motion
      ]}
    >
      <Svg
        width={EYE_WIDTH * scale}
        height={canvasHeight}
        viewBox={`0 0 ${EYE_WIDTH} ${EYE_CANVAS_HEIGHT}`}
      >
        <Ellipse
          cx={EYE_WIDTH / 2}
          cy={EYE_CANVAS_HEIGHT / 2}
          rx={EYE_WIDTH / 2}
          ry={EYE_HEIGHT / 2}
          fill={color}
        />
      </Svg>
    </Animated.View>
  )
}

export function JarvisEyes(props: JarvisEyesProps) {
  return (
    <>
      <Eye side={-1} testID="jarvis-eye-left" {...props} />
      <Eye side={1} testID="jarvis-eye-right" {...props} />
    </>
  )
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute'
  }
})
