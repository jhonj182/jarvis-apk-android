// Where a cold start lands. Pure: the home route reads the launch inputs and asks here.

export interface JarvisColdStartLaunch {
  /** `Linking.getInitialURL()`: set when a deep link opened the app. */
  initialUrl: string | null
  /** `Notifications.getLastNotificationResponse()`: set when a notification tap opened it. */
  initialNotificationResponse: unknown
}

/** True unless something else already asked for a screen: a link or a notification. */
export function shouldLandOnAssistant(launch: JarvisColdStartLaunch): boolean {
  const openedByLink = typeof launch.initialUrl === 'string' && launch.initialUrl.length > 0
  const openedByNotification = launch.initialNotificationResponse !== null
  return !openedByLink && !openedByNotification
}

// Why a module flag and not a ref: the home screen can unmount and mount again in the
// same process, and a ref would forget that. A process reload resets it, as it should.
let coldStartTaken = false

/** True the first time it is called in a process, false on every later call. */
export function consumeJarvisColdStart(): boolean {
  if (coldStartTaken) {
    return false
  }
  coldStartTaken = true
  return true
}
