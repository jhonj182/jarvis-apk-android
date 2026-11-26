import { useEffect, useState } from 'react'
import { Keyboard } from 'react-native'

/**
 * True while the soft keyboard is open. The screen drops the navigation-bar inset then:
 * with edge-to-edge the inset stays reported under the keyboard and would leave a gap.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setVisible(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setVisible(false))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [])

  return visible
}
