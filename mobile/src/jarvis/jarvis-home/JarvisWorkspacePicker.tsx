import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { Text } from '../../theme/dynamic-type-text'
import type {
  JarvisPreferencesController,
  JarvisWorkspaceOption,
  JarvisWorkspaceOptions
} from '../jarvis-contract'
import { jarvisFontWeights, jarvisPalette, jarvisSpacing, jarvisTypeSizes } from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'
import { JarvisPillButton } from './JarvisPillButton'
import { JarvisSettingsRow } from './JarvisSettingsPrimitives'

interface JarvisWorkspacePickerProps {
  controller: JarvisPreferencesController
  options: JarvisWorkspaceOptions
  onScanPairingCode?: () => void
}

interface HostGroup {
  hostId: string
  hostName: string
  workspaces: JarvisWorkspaceOption[]
}

const copy = jarvisCopy.settingsScreen

function groupByHost(options: JarvisWorkspaceOption[]): HostGroup[] {
  const groups: HostGroup[] = []
  for (const option of options) {
    const group = groups.find((candidate) => candidate.hostId === option.hostId)
    if (group) {
      group.workspaces.push(option)
    } else {
      groups.push({ hostId: option.hostId, hostName: option.hostName, workspaces: [option] })
    }
  }
  return groups
}

/** The desktop workspaces that can play Jarvis, one radio group under each desktop's name. */
export function JarvisWorkspacePicker({
  controller,
  options,
  onScanPairingCode
}: JarvisWorkspacePickerProps) {
  const { workspace } = controller.preferences
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const choose = async (option: JarvisWorkspaceOption): Promise<void> => {
    const alreadyChosen =
      workspace !== null &&
      workspace.hostId === option.hostId &&
      workspace.worktreeId === option.worktreeId
    if (saving || alreadyChosen) {
      return
    }
    setSaving(true)
    setSaveFailed(false)
    try {
      await controller.setWorkspace({
        hostId: option.hostId,
        worktreeId: option.worktreeId,
        name: option.name
      })
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (options.options.length === 0) {
    return (
      <View style={styles.empty}>
        {options.loading ? (
          <Text style={styles.note}>{copy.workspaceLoading}</Text>
        ) : options.error ? (
          <>
            <Text style={styles.note}>{copy.workspaceError}</Text>
            <JarvisPillButton label={copy.retry} onPress={options.refresh} />
          </>
        ) : (
          <>
            <Text style={styles.note}>{copy.workspaceEmpty}</Text>
            {onScanPairingCode ? (
              <JarvisPillButton label={copy.scan} onPress={onScanPairingCode} />
            ) : null}
          </>
        )}
      </View>
    )
  }

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={copy.workspaceGroup}>
      {groupByHost(options.options).map((group) => (
        <View key={group.hostId} style={styles.host}>
          <Text accessibilityRole="header" style={styles.hostName}>
            {group.hostName}
          </Text>
          {group.workspaces.map((option) => {
            const selected =
              workspace !== null &&
              workspace.hostId === option.hostId &&
              workspace.worktreeId === option.worktreeId
            return (
              <JarvisSettingsRow
                key={option.worktreeId}
                testID="jarvis-workspace-option"
                label={option.name}
                role="radio"
                checked={selected}
                disabled={saving}
                onPress={() => void choose(option)}
                accessory={
                  selected ? (
                    <Check size={18} color={jarvisPalette.gold} />
                  ) : (
                    <View style={styles.noMark} />
                  )
                }
              />
            )
          })}
        </View>
      ))}
      {saveFailed ? <Text style={styles.error}>{copy.saveFailed}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    marginTop: jarvisSpacing.sm
  },
  hostName: {
    paddingHorizontal: jarvisSpacing.lg,
    paddingTop: jarvisSpacing.sm,
    paddingBottom: jarvisSpacing.xs,
    fontSize: jarvisTypeSizes.label,
    fontWeight: jarvisFontWeights.label,
    color: jarvisPalette.ice
  },
  noMark: {
    width: 18,
    height: 18
  },
  empty: {
    alignItems: 'center',
    padding: jarvisSpacing.lg,
    gap: jarvisSpacing.md
  },
  note: {
    fontSize: jarvisTypeSizes.status,
    lineHeight: 21,
    textAlign: 'center',
    color: jarvisPalette.fog
  },
  error: {
    paddingHorizontal: jarvisSpacing.lg,
    paddingTop: jarvisSpacing.sm,
    fontSize: jarvisTypeSizes.label,
    color: jarvisPalette.coral
  }
})
