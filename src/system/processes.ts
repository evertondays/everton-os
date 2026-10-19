import type { LaunchArgs } from '../sdk/app.ts'
import type { AppId } from './apps.ts'
import { createStore } from './store.ts'

// The process table: one entry per running app instance, whatever shell shows
// it (a window, a screen). `ps` and `kill` in the Terminal read it.

export type Pid = number

export interface Process {
  pid: Pid
  appId: AppId
  args: LaunchArgs
  startedAt: number
  /** Bumped each time the process is handed new arguments (single-instance apps; see useLaunchArgs). */
  launches: number
}

export const processes = createStore<{ list: Process[] }>({ list: [] })

let nextPid = 100

export function spawn(appId: AppId, args: LaunchArgs): Process {
  const process: Process = { pid: nextPid++, appId, args, startedAt: Date.now(), launches: 0 }
  processes.set((state) => ({ list: [...state.list, process] }))
  return process
}

/** Hands new arguments to a running process. */
export function relaunch(pid: Pid, args: LaunchArgs) {
  processes.set((state) => ({
    list: state.list.map((process) => (process.pid === pid ? { ...process, args, launches: process.launches + 1 } : process)),
  }))
}

export function exit(pid: Pid) {
  processes.set((state) => ({ list: state.list.filter((process) => process.pid !== pid) }))
}

export const getProcess = (pid: Pid) => processes.get().list.find((process) => process.pid === pid)

/** Whether `args` asks for anything (single-instance apps only get the ones that do). */
export const hasArgs = (args: LaunchArgs) => !!(args.url || args.files?.length || args.argv?.length)
