import { useFonts } from 'expo-font'
import {
  JARVIS_DISPLAY_FONT_FAMILY,
  jarvisDisplayStyle,
  type JarvisDisplayStyle
} from '../jarvis-theme'

/**
 * Style for rotulados: the name and the clock. The face loads once per process; until it does,
 * and if it fails, the style asks the system font for weight 600 instead.
 */
export function useJarvisDisplayFont(): JarvisDisplayStyle {
  // Why `require` and not an import: Metro resolves the font as an asset either way, and an
  // import would need a module declaration for `*.ttf`.
  const [loaded] = useFonts({
    [JARVIS_DISPLAY_FONT_FAMILY]: require('../../../assets/fonts/ChakraPetch-SemiBold.ttf')
  })
  return jarvisDisplayStyle(loaded)
}
