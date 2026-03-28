import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import {
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorState,
} from '@blocknote/react'
import { useCallback, useMemo } from 'react'

/**
 * Predefined colour palette available for both text and background styling.
 *
 * The `"default"` entry represents the absence of a colour override and is
 * treated as "no colour" — selecting it removes the active style.
 */
const COLORS = [
  'default',
  'gray',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
] as const

/**
 * Checks whether the editor's style schema declares a given colour style.
 *
 * BlockNote registers text and background colours as style schema entries
 * (e.g. `"textColor"`, `"backgroundColor"`).  This guard ensures the button
 * only offers colours that the current editor schema actually supports.
 *
 * @param color - The colour category to check (`"text"` or `"background"`).
 * @param editor - The BlockNote editor instance whose schema is inspected.
 * @returns `true` when the schema contains the expected style entry with a
 *   `string` prop schema; `false` otherwise.
 */
function checkColorInSchema<Color extends 'text' | 'background'>(
  color: Color,
  editor: BlockNoteEditor<any, any, any>
): boolean {
  const key = `${color}Color`
  return (
    key in editor.schema.styleSchema &&
    editor.schema.styleSchema[key].type === key &&
    editor.schema.styleSchema[key].propSchema === 'string'
  )
}

/**
 * Renders a small letter "A" icon that previews the current text and/or
 * background colour state.
 *
 * The component delegates the actual colour rendering to BlockNote's
 * `data-text-color` / `data-background-color` attributes, which are styled
 * by the editor's CSS theme.
 *
 * @param props.textColor       - Active text colour token (defaults to `"default"`).
 * @param props.backgroundColor - Active background colour token (defaults to `"default"`).
 * @param props.size            - Width and height of the icon in pixels (defaults to `16`).
 */
function ColorIcon({
  textColor = 'default',
  backgroundColor = 'default',
  size = 16,
}: {
  textColor?: string
  backgroundColor?: string
  size?: number
}) {
  const style = useMemo(
    () =>
      ({
        pointerEvents: 'none',
        fontSize: `${size * 0.75}px`,
        height: `${size}px`,
        lineHeight: `${size}px`,
        textAlign: 'center',
        width: `${size}px`,
      }) as const,
    [size]
  )

  return (
    <div
      className="bn-color-icon"
      data-background-color={backgroundColor}
      data-text-color={textColor}
      style={style}
    >
      A
    </div>
  )
}

/**
 * A two-section colour picker menu with separate lists for text and
 * background colours.
 *
 * Each section renders a labelled row of colour items drawn from
 * {@link COLORS}.  When a colour is selected the corresponding `setColor`
 * callback is invoked and the optional `onClick` handler fires (used by the
 * parent menu to close the dropdown).
 *
 * @param props.onClick    - Optional callback invoked when any colour item is clicked.
 * @param props.iconSize   - Size of the colour preview icon rendered beside each item.
 * @param props.text       - When provided, renders the text-colour section with the
 *   current colour and a setter.
 * @param props.background - When provided, renders the background-colour section with
 *   the current colour and a setter.
 */
function ColorPicker({
  onClick,
  iconSize,
  text,
  background,
}: {
  onClick?: () => void
  iconSize?: number
  text?: { color: string; setColor: (color: string) => void }
  background?: { color: string; setColor: (color: string) => void }
}) {
  const Components = useComponentsContext()!
  const dict = useDictionary()

  return (
    <>
      {text && (
        <>
          <Components.Generic.Menu.Label>
            {dict.color_picker.text_title}
          </Components.Generic.Menu.Label>
          {COLORS.map((color) => (
            <Components.Generic.Menu.Item
              onClick={() => {
                onClick?.()
                text.setColor(color)
              }}
              data-test={`text-color-${color}`}
              icon={<ColorIcon textColor={color} size={iconSize} />}
              checked={text.color === color}
              key={`text-color-${color}`}
            >
              {dict.color_picker.colors[color]}
            </Components.Generic.Menu.Item>
          ))}
        </>
      )}
      {background && (
        <>
          <Components.Generic.Menu.Label>
            {dict.color_picker.background_title}
          </Components.Generic.Menu.Label>
          {COLORS.map((color) => (
            <Components.Generic.Menu.Item
              onClick={() => {
                onClick?.()
                background.setColor(color)
              }}
              data-test={`background-color-${color}`}
              icon={<ColorIcon backgroundColor={color} size={iconSize} />}
              checked={background.color === color}
              key={`background-color-${color}`}
            >
              {dict.color_picker.colors[color]}
            </Components.Generic.Menu.Item>
          ))}
        </>
      )}
    </>
  )
}

/**
 * Formatting-toolbar button that opens a colour picker for text and
 * background colours.
 *
 * Reads the active text/background colours from the editor state and
 * displays a preview icon that reflects the current selection.  When any
 * non-default colour is active the button receives a `"color-active"` CSS
 * class so it visually matches other pressed toolbar toggles.
 *
 * Selecting `"default"` removes the corresponding style from the selection;
 * any other colour is applied via `editor.addStyles`.
 *
 * @returns A BlockNote FormattingToolbar button component, or `null` when
 *   the editor is not editable or neither text nor background colour styles
 *   exist in the schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CustomColorStyleButton = (): any => {
  const Components = useComponentsContext()!
  const dict = useDictionary()
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()

  const textColorInSchema = checkColorInSchema('text', editor)
  const backgroundColorInSchema = checkColorInSchema('background', editor)

  /**
   * Reactive snapshot of the current text/background colour state.
   *
   * Returns `undefined` when:
   * - the editor is not editable, or
   * - the selection does not contain any content-bearing blocks, or
   * - neither `textColor` nor `backgroundColor` is registered in the schema.
   *
   * When defined the object carries `textColor`, `backgroundColor` (each
   * defaulting to `"default"` when present), and `hasActiveColor` which is
   * `true` when at least one non-default colour is applied (the `"highlight"`
   * background value is excluded because it is the dedicated highlighter
   * colour managed by a separate button).
   */
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (
        !editor.isEditable ||
        !(
          editor.getSelection()?.blocks || [
            editor.getTextCursorPosition().block,
          ]
        ).find((block) => block.content !== undefined)
      ) {
        return undefined
      }

      if (!textColorInSchema && !backgroundColorInSchema) {
        return undefined
      }

      const textColor = (
        textColorInSchema
          ? editor.getActiveStyles().textColor || 'default'
          : undefined
      ) as string | undefined
      const backgroundColor = (
        backgroundColorInSchema
          ? editor.getActiveStyles().backgroundColor || 'default'
          : undefined
      ) as string | undefined

      const hasActiveColor =
        (textColor !== undefined && textColor !== 'default') ||
        (backgroundColor !== undefined &&
          backgroundColor !== 'default' &&
          backgroundColor !== 'highlight')

      return { textColor, backgroundColor, hasActiveColor }
    },
  })

  /**
   * Applies or removes a text colour on the current editor selection.
   *
   * When `color` is `"default"` the style is stripped via `editor.removeStyles`;
   * otherwise the style is added via `editor.addStyles`.  Focus is restored
   * asynchronously after the operation to keep the cursor inside the editor.
   */
  const setTextColor = useCallback(
    (color: string) => {
      if (!textColorInSchema) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const style = { textColor: color } as any
      if (color === 'default') {
        editor.removeStyles(style)
      } else {
        editor.addStyles(style)
      }
      setTimeout(() => editor.focus())
    },
    [editor, textColorInSchema]
  )

  /**
   * Applies or removes a background colour on the current editor selection.
   *
   * Mirrors {@link setTextColor} for the `backgroundColor` style property.
   */
  const setBackgroundColor = useCallback(
    (color: string) => {
      if (!backgroundColorInSchema) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const style = { backgroundColor: color } as any
      if (color === 'default') {
        editor.removeStyles(style)
      } else {
        editor.addStyles(style)
      }
      setTimeout(() => editor.focus())
    },
    [backgroundColorInSchema, editor]
  )

  if (state === undefined) {
    return null
  }

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button
          className={`bn-button${state.hasActiveColor ? ' color-active' : ''}`}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ 'data-test': 'colors' } as any)}
          label={dict.formatting_toolbar.colors.tooltip}
          mainTooltip={dict.formatting_toolbar.colors.tooltip}
          icon={
            <ColorIcon
              textColor={state.textColor}
              backgroundColor={state.backgroundColor}
              size={20}
            />
          }
        />
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-color-picker-dropdown">
        <ColorPicker
          text={
            state.textColor
              ? { color: state.textColor, setColor: setTextColor }
              : undefined
          }
          background={
            state.backgroundColor
              ? {
                  color: state.backgroundColor,
                  setColor: setBackgroundColor,
                }
              : undefined
          }
        />
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  )
}
