import { IncomingMessage } from './types.js';

export type CommandHandler = (msg: IncomingMessage, args: string[], adapter: any) => Promise<void>;

export interface Command {
  name: string;
  category: 'general' | 'admin' | 'owner' | 'utility';
  description: string;
  handler: CommandHandler;
}

export class Pipeline {
  private commands: Map<string, Command> = new Map();
  private processedMessages: Set<string> = new Set();

  registerCommand(command: Command) {
    this.commands.set(command.name.toLowerCase(), command);
  }

  getCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name.toLowerCase());
  }

  async process(msg: IncomingMessage, adapter: any): Promise<void> {
    // 1. Deduplication
    if (!msg.id || this.processedMessages.has(msg.id)) return;
    this.processedMessages.add(msg.id);

    // Prevent memory leaks (keep only last 1000 IDs)
    if (this.processedMessages.size > 1000) {
      const firstItem = this.processedMessages.values().next().value;
      if (firstItem) this.processedMessages.delete(firstItem);
    }

    // 2. Parser
    if (!msg.text) return;
    const prefix = '.';
    if (!msg.text.startsWith(prefix)) return;

    const args = msg.text.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    const command = this.getCommand(commandName);
    if (!command) return;

    // 3. Execute Handler
    try {
      await command.handler(msg, args, adapter);
    } catch (error) {
      console.error(`Error executing command ${commandName}:`, error);
      await adapter.sendText(msg.chatJid, `❌ *Error:* Failed to execute command.`);
    }
  }
}
