import { useLayoutEffect, useMemo, useRef } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { Text } from '../../theme/dynamic-type-text'
import type { JarvisMessage } from '../jarvis-contract'
import { jarvisMarkdownToLines, type JarvisTranscriptLine } from '../jarvis-markdown'
import {
  jarvisAlpha,
  jarvisFontWeights,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'

interface JarvisTranscriptProps {
  /** Oldest first, the way a conversation reads. The list itself is inverted. */
  messages: JarvisMessage[]
}

/** Within this distance of the newest message the owner counts as reading it. */
const NEWEST_SLACK_PX = 48
const LIST_DEPTH_INDENT = 16

// Why a loop and not reverse: unicorn/no-array-reverse forbids it, and toReversed is not
// guaranteed on Hermes.
function newestFirst(messages: JarvisMessage[]): JarvisMessage[] {
  const reversed: JarvisMessage[] = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    reversed.push(messages[index])
  }
  return reversed
}

/**
 * The conversation, newest at the bottom. It follows the answer while it grows only if the
 * owner is at the newest message, so reading older messages is never interrupted; when the
 * owner writes, it jumps to the answer whatever they were reading.
 */
export function JarvisTranscript({ messages }: JarvisTranscriptProps) {
  const listRef = useRef<FlatList<JarvisMessage>>(null)
  const atNewest = useRef(true)
  const data = useMemo(() => newestFirst(messages), [messages])
  const newest = messages[messages.length - 1]
  const newestId = newest?.id
  const newestIsOwner = newest?.role === 'user'

  // The owner just wrote: go to the answer, whatever they were reading. The list itself jumps
  // when the new row lays out (see stayWithNewest); this only marks that it must.
  // Why a layout effect: the mark has to be in place before the native list reports its new size.
  useLayoutEffect(() => {
    if (newestIsOwner) {
      atNewest.current = true
    }
  }, [newestId, newestIsOwner])

  const stayWithNewest = (): void => {
    if (atNewest.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false })
    }
  }

  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      data={data}
      inverted
      keyExtractor={(message) => message.id}
      renderItem={({ item }) => <JarvisMessageRow message={item} />}
      accessibilityLabel={jarvisCopy.conversation}
      onScroll={(event) => {
        atNewest.current = event.nativeEvent.contentOffset.y <= NEWEST_SLACK_PX
      }}
      scrollEventThrottle={64}
      onContentSizeChange={stayWithNewest}
      contentContainerStyle={styles.content}
    />
  )
}

function JarvisMessageRow({ message }: { message: JarvisMessage }) {
  const { role, text, streaming } = message
  const fromAssistant = role === 'assistant'
  // Why the engine's words are cleaned here and the owner's are not: only the agent writes markdown.
  const lines = useMemo<JarvisTranscriptLine[]>(
    () =>
      fromAssistant
        ? jarvisMarkdownToLines(text)
        : [{ kind: 'text' as const, text, marker: null, depth: 0 }],
    [fromAssistant, text]
  )

  return (
    <View
      testID={fromAssistant ? 'jarvis-message-assistant' : 'jarvis-message-user'}
      style={styles.row}
    >
      <Text style={[styles.speaker, fromAssistant && styles.speakerAssistant]}>
        {fromAssistant ? jarvisCopy.jarvis : jarvisCopy.you}
      </Text>
      {fromAssistant && lines.length === 0 ? (
        <Text style={styles.writing} accessibilityLabel={jarvisCopy.writingLabel}>
          {jarvisCopy.writing}
        </Text>
      ) : (
        // Why hidden while streaming: a live region would read every fragment as it arrives.
        // It reads the whole answer once, when it is complete.
        <View
          style={[styles.body, !fromAssistant && styles.userBody]}
          accessibilityLiveRegion="polite"
          accessibilityElementsHidden={streaming}
        >
          {lines.map((line, index) =>
            line.kind === 'code' ? (
              <Text key={index} style={styles.code}>
                {line.text || ' '}
              </Text>
            ) : (
              <Text
                key={index}
                style={[
                  styles.line,
                  line.depth > 0 && { paddingLeft: line.depth * LIST_DEPTH_INDENT }
                ]}
              >
                {line.marker ? `${line.marker} ` : ''}
                {line.text}
              </Text>
            )
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1
  },
  content: {
    paddingHorizontal: jarvisSpacing.screenGutter,
    paddingTop: jarvisSpacing.md,
    paddingBottom: jarvisSpacing.sm
  },
  row: {
    marginBottom: jarvisSpacing.lg
  },
  speaker: {
    fontSize: jarvisTypeSizes.speakerLabel,
    fontWeight: jarvisFontWeights.label,
    marginBottom: jarvisSpacing.xs,
    color: jarvisPalette.mist
  },
  speakerAssistant: {
    color: jarvisPalette.gold
  },
  body: {
    alignSelf: 'flex-start',
    maxWidth: '100%'
  },
  userBody: {
    backgroundColor: jarvisPalette.ink,
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingHorizontal: jarvisSpacing.md,
    paddingVertical: jarvisSpacing.sm + 2
  },
  line: {
    fontSize: jarvisTypeSizes.conversation,
    lineHeight: 24,
    color: jarvisPalette.fog
  },
  code: {
    // Why a system monospace and not a display face: code is to be copied, not styled.
    fontFamily: 'monospace',
    fontSize: jarvisTypeSizes.label,
    lineHeight: 19,
    color: jarvisAlpha('fog', 0.85)
  },
  writing: {
    fontSize: jarvisTypeSizes.conversation,
    lineHeight: 24,
    color: jarvisPalette.mist
  }
})
