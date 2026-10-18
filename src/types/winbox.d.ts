// WinBox ships no types. This covers the part of its API that useWindow.ts uses.
declare module 'winbox/src/js/winbox.js' {
  export interface WinBoxOptions {
    id?: string
    index?: number
    root?: Node
    title?: string
    mount?: Node
    width?: number | string
    height?: number | string
    minwidth?: number | string
    minheight?: number | string
    x?: number | string
    y?: number | string
    top?: number | string
    right?: number | string
    bottom?: number | string
    left?: number | string
    max?: boolean
    min?: boolean
    hidden?: boolean
    /** Header height in px. */
    header?: number
    class?: string | string[]
    /** Return true to keep the window open. */
    onclose?: (force?: boolean) => boolean | void
    onfocus?: () => void
    onblur?: () => void
    onminimize?: () => void
    onmaximize?: () => void
    onrestore?: () => void
  }

  export default class WinBox {
    constructor(options: WinBoxOptions)
    id: string
    body: HTMLElement
    window: HTMLElement
    min: boolean
    max: boolean
    focused: boolean
    /** Position and size in the normal (not minimized or maximized) state. */
    x: number
    y: number
    width: number
    height: number
    focus(): this
    blur(): this
    minimize(): this
    maximize(): this
    restore(): this
    move(x?: number, y?: number): this
    resize(width?: number, height?: number): this
    close(force?: boolean): boolean | void
    setTitle(title: string): this
  }
}
