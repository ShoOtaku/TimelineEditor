// ============================================================
// Plugin System — Extensibility framework for the Timeline Editor
// ============================================================

import type { TreeNode } from '@shared/types'

export interface PluginManifest {
  name: string
  version: string
  description: string
  author?: string
  /** $type strings this plugin handles */
  nodeTypes: string[]
  /** Condition $type strings this plugin provides editors for */
  conditionTypes: string[]
  /** Action $type strings this plugin provides editors for */
  actionTypes: string[]
}

export interface PluginAPI {
  /** Register a custom ReactFlow node renderer */
  registerNodeRenderer: (nodeType: string, component: React.ComponentType<any>) => void
  /** Register a custom property panel section */
  registerPropertyEditor: (nodeType: string, component: React.ComponentType<{ node: TreeNode; onChange: (changes: Partial<TreeNode>) => void }>) => void
  /** Register a condition sub-editor */
  registerConditionEditor: (condType: string, component: React.ComponentType<{ condition: any; onChange: (changes: any) => void }>) => void
  /** Register an action sub-editor */
  registerActionEditor: (actionType: string, component: React.ComponentType<{ action: any; onChange: (changes: any) => void }>) => void
  /** Register a script validator (returns error string or null if valid) */
  registerScriptValidator: (fn: (script: string) => string | null) => void
  /** Register custom app menu items */
  registerMenuItems: (items: PluginMenuItem[]) => void
}

export interface PluginMenuItem {
  label: string
  onClick: () => void
  accelerator?: string
  section?: string
}

export interface PluginModule {
  manifest: PluginManifest
  activate: (api: PluginAPI) => void
  deactivate?: () => void
}

// Registry
class PluginRegistry {
  private plugins: Map<string, PluginModule> = new Map()
  private nodeRenderers: Map<string, React.ComponentType<any>> = new Map()
  private propertyEditors: Map<string, React.ComponentType<any>> = new Map()
  private conditionEditors: Map<string, React.ComponentType<any>> = new Map()
  private actionEditors: Map<string, React.ComponentType<any>> = new Map()
  private scriptValidators: Array<(script: string) => string | null> = []
  private menuItems: PluginMenuItem[] = []

  register(plugin: PluginModule): void {
    if (this.plugins.has(plugin.manifest.name)) {
      console.warn(`Plugin "${plugin.manifest.name}" is already registered`)
      return
    }

    const api: PluginAPI = {
      registerNodeRenderer: (nodeType, component) => {
        this.nodeRenderers.set(nodeType, component)
      },
      registerPropertyEditor: (nodeType, component) => {
        this.propertyEditors.set(nodeType, component)
      },
      registerConditionEditor: (condType, component) => {
        this.conditionEditors.set(condType, component)
      },
      registerActionEditor: (actionType, component) => {
        this.actionEditors.set(actionType, component)
      },
      registerScriptValidator: (fn) => {
        this.scriptValidators.push(fn)
      },
      registerMenuItems: (items) => {
        this.menuItems.push(...items)
      }
    }

    plugin.activate(api)
    this.plugins.set(plugin.manifest.name, plugin)
    console.log(`Plugin activated: ${plugin.manifest.name} v${plugin.manifest.version}`)
  }

  unregister(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) return
    plugin.deactivate?.()
    // Clean up registrations
    for (const nodeType of plugin.manifest.nodeTypes) {
      this.nodeRenderers.delete(nodeType)
      this.propertyEditors.delete(nodeType)
    }
    for (const condType of plugin.manifest.conditionTypes) {
      this.conditionEditors.delete(condType)
    }
    for (const actionType of plugin.manifest.actionTypes) {
      this.actionEditors.delete(actionType)
    }
    this.plugins.delete(name)
  }

  getNodeRenderer(nodeType: string): React.ComponentType<any> | null {
    return this.nodeRenderers.get(nodeType) || null
  }

  getPropertyEditor(nodeType: string): React.ComponentType<any> | null {
    return this.propertyEditors.get(nodeType) || null
  }

  getConditionEditor(condType: string): React.ComponentType<any> | null {
    return this.conditionEditors.get(condType) || null
  }

  getActionEditor(actionType: string): React.ComponentType<any> | null {
    return this.actionEditors.get(actionType) || null
  }

  validateScript(script: string): string | null {
    for (const validator of this.scriptValidators) {
      const error = validator(script)
      if (error) return error
    }
    return null
  }

  getMenuItems(): PluginMenuItem[] {
    return [...this.menuItems]
  }

  getPlugins(): PluginModule[] {
    return Array.from(this.plugins.values())
  }
}

// Singleton
export const pluginRegistry = new PluginRegistry()

// Plugin loader — scans a directory for plugins
export async function loadPluginsFromDirectory(_dirPath: string): Promise<void> {
  // In Electron, we'd use IPC to scan the directory and load plugin files.
  // For now, this is a placeholder — plugins can be registered programmatically.
  console.log('Plugin directory scanning not yet implemented')
}
