import { DataContext } from '@packages/data-context'
import os from 'os'
import type { App } from 'electron'

import specsUtil from './util/specs'
import type { Editor, FindSpecs, FoundBrowser, LaunchArgs, LaunchOpts, OpenProjectLaunchOptions, PlatformName, Preferences, SettingsOptions } from '@packages/types'
import browserUtils from './browsers/utils'
import auth from './gui/auth'
import user from './user'
import * as config from './config'
import { EventEmitter } from 'events'
import { openProject } from './open_project'
import cache from './cache'
import errors from './errors'
import findSystemNode from './util/find_system_node'
import { graphqlSchema } from '@packages/graphql/src/schema'
import type { InternalDataContextOptions } from '@packages/data-context/src/DataContext'
import { openExternal } from '@packages/server/lib/gui/links'
import { getDevicePreferences, setDevicePreference } from './util/device_preferences'
import { getUserEditor, setUserEditor } from './util/editors'

const { getBrowsers, ensureAndGetByNameOrPath } = browserUtils

interface MakeDataContextOptions {
  electronApp?: App
  os: PlatformName
  rootBus: EventEmitter
  launchArgs: LaunchArgs
  _internalOptions: InternalDataContextOptions
}

let legacyDataContext: DataContext | undefined

// For testing
export async function clearLegacyDataContext () {
  await legacyDataContext?.destroy()
  legacyDataContext = undefined
}

export function makeLegacyDataContext (launchArgs: LaunchArgs = {} as LaunchArgs): DataContext {
  if (legacyDataContext && process.env.LAUNCHPAD) {
    throw new Error(`Expected ctx to be passed as an arg, but used legacy data context`)
  } else if (!legacyDataContext) {
    legacyDataContext = makeDataContext({
      rootBus: new EventEmitter,
      launchArgs,
      os: os.platform() as PlatformName,
      _internalOptions: {
        loadCachedProjects: true,
      },
    })
  }

  return legacyDataContext
}

export function makeDataContext (options: MakeDataContextOptions): DataContext {
  const ctx = new DataContext({
    schema: graphqlSchema,
    ...options,
    launchOptions: {},
    appApi: {
      getBrowsers,
      ensureAndGetByNameOrPath,
      findNodePath () {
        return findSystemNode.findNodeInFullPath()
      },
    },
    authApi: {
      getUser () {
        return user.get()
      },
      logIn (onMessage) {
        return auth.start(onMessage, 'launchpad')
      },
      logOut () {
        return user.logOut()
      },
    },
    projectApi: {
      getConfig (projectRoot: string, options?: SettingsOptions) {
        return config.get(projectRoot, options, ctx)
      },
      launchProject (browser: FoundBrowser, spec: Cypress.Spec, options?: LaunchOpts) {
        return openProject.launch({ ...browser }, spec, options)
      },
      initializeProject (args: LaunchArgs, options: OpenProjectLaunchOptions, browsers: FoundBrowser[]) {
        return openProject.create(args.projectRoot, args, options, browsers)
      },
      insertProjectToCache (projectRoot: string) {
        cache.insertProject(projectRoot)
      },
      getProjectRootsFromCache () {
        return cache.getProjectRoots()
      },
      findSpecs (payload: FindSpecs) {
        return specsUtil.findSpecs(payload)
      },
      clearLatestProjectsCache () {
        return cache.removeLatestProjects()
      },
      getProjectPreferencesFromCache () {
        return cache.getProjectPreferences()
      },
      clearProjectPreferences (projectTitle: string) {
        return cache.removeProjectPreferences(projectTitle)
      },
      clearAllProjectPreferences () {
        return cache.removeAllProjectPreferences()
      },
      insertProjectPreferencesToCache (projectTitle: string, preferences: Preferences) {
        cache.insertProjectPreferences(projectTitle, preferences)
      },
      removeProjectFromCache (path: string) {
        return cache.removeProject(path)
      },
      closeActiveProject () {
        return openProject.closeActiveProject()
      },
      get error () {
        return errors
      },
    },
    electronApi: {
      openExternal (url: string) {
        openExternal(url)
      },
    },
    localSettingsApi: {
      setDevicePreference (key, value) {
        return setDevicePreference(key, value)
      },

      async getPreferences () {
        return getDevicePreferences()
      },
      async setPreferredOpener (editor: Editor) {
        await setUserEditor(editor)
      },
      async getAvailableEditors () {
        const { availableEditors } = await getUserEditor(true)

        return availableEditors
      },
    },
  })

  return ctx
}