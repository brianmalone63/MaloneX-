import { Pipeline } from '../core/pipeline.js';
import { WhatsAppAdapter } from '../core/types.js';

export function registerCommands(pipeline: Pipeline) {
  // 1. MENU COMMAND
  pipeline.registerCommand({
    name: 'menu',
    category: 'general',
    description: 'Show all available commands',
    handler: async (msg, args, adapter: WhatsAppAdapter) => {
      const commands = pipeline.getCommands();
      const categories = ['general', 'admin', 'owner', 'utility'];
      
      let menu = `╭━━━〔 *MALONEX BOT* 〕━━━╮\n`;
      menu += `┃ ✦ Prefix: .\n`;
      menu += `┃ ✦ Total Commands: ${commands.length}\n`;
      menu += `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

      for (const cat of categories) {
        const catCmds = commands.filter(c => c.category === cat);
        if (catCmds.length === 0) continue;
        
        menu += `*『 ${cat.toUpperCase()} 』*\n`;
        for (const cmd of catCmds) {
          menu += `┃ ➤ .${cmd.name}\n`;
        }
        menu += `\n`;
      }
      
      menu += `_MaloneX v1.0.0_`;
      await adapter.sendText(msg.chatJid, menu);
    }
  });

  // 2. PING COMMAND
  pipeline.registerCommand({
    name: 'ping',
    category: 'general',
    description: 'Check bot latency',
    handler: async (msg, args, adapter: WhatsAppAdapter) => {
      const start = Date.now();
      // Calculate roundtrip latency based on the message timestamp
      const latency = start - msg.timestamp;
      await adapter.sendText(msg.chatJid, `🏓 *Pong!*\nLatency: ${latency}ms`);
    }
  });

  // 3. OWNER COMMAND
  pipeline.registerCommand({
    name: 'owner',
    category: 'general',
    description: 'Show bot owner contact',
    handler: async (msg, args, adapter: WhatsAppAdapter) => {
      // Strip LID/JID formatting to get raw phone number for wa.me links
      const owners = (process.env.OWNER_IDS || '')
        .split(',')
        .map(id => id.trim().replace(/[^0-9]/g, ''))
        .filter(id => id.length > 0);
        
      let text = `👑 *Bot Owner(s)*\n\n`;
      if (owners.length === 0) {
        text += `Owner not configured.`;
      } else {
        for (const owner of owners) {
          text += `wa.me/${owner}\n`;
        }
      }
      await adapter.sendText(msg.chatJid, text);
    }
  });

  // 4. GROUP INFO COMMAND
  pipeline.registerCommand({
    name: 'groupinfo',
    category: 'general',
    description: 'Show group metadata',
    handler: async (msg, args, adapter: WhatsAppAdapter) => {
      if (!msg.isGroup) {
        await adapter.sendText(msg.chatJid, '❌ This command can only be used in groups.');
        return;
      }
      
      try {
        const metadata = await adapter.getGroupMetadata(msg.chatJid);
        let text = `*Group Info*\n\n`;
        text += `*Name:* ${metadata.subject}\n`;
        text += `*ID:* ${metadata.id}\n`;
        text += `*Participants:* ${metadata.participants.length}\n`;
        text += `*Owner:* ${metadata.owner || 'Unknown'}\n`;
        await adapter.sendText(msg.chatJid, text);
      } catch (err) {
        await adapter.sendText(msg.chatJid, '❌ Failed to fetch group info.');
      }
    }
  });
    }
