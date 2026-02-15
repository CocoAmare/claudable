// OpenClaw Tool Registry
// Community-extensible plugin system. Register tools, discover capabilities.

import type { OpenClawTool, ToolCapability } from '../types';

class ToolRegistry {
  private tools: Map<string, OpenClawTool> = new Map();

  /** Register a tool. Overwrites if ID already exists. */
  register(tool: OpenClawTool): void {
    this.tools.set(tool.id, tool);
    console.log(`[OpenClaw] Registered tool: ${tool.name} (${tool.id})`);
  }

  /** Unregister a tool by ID. */
  unregister(id: string): boolean {
    const removed = this.tools.delete(id);
    if (removed) {
      console.log(`[OpenClaw] Unregistered tool: ${id}`);
    }
    return removed;
  }

  /** Get a specific tool by ID. */
  get(id: string): OpenClawTool | undefined {
    return this.tools.get(id);
  }

  /** Find all tools that have a given capability. */
  findByCapability(capability: ToolCapability): OpenClawTool[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.capabilities.includes(capability)
    );
  }

  /** Check which registered tools are actually available right now. */
  async checkAvailability(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const checks = Array.from(this.tools.entries()).map(async ([id, tool]) => {
      try {
        const available = await tool.isAvailable();
        results.set(id, available);
      } catch {
        results.set(id, false);
      }
    });
    await Promise.all(checks);
    return results;
  }

  /** List all registered tool IDs. */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Get all registered tools. */
  all(): OpenClawTool[] {
    return Array.from(this.tools.values());
  }
}

// Singleton -- tools register themselves on import
export const registry = new ToolRegistry();
