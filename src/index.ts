import { Pipeline } from '../core/pipeline.js';
import { WhatsAppAdapter, StorageAdapter } from '../core/types.js';

export function registerCommands(pipeline: Pipeline, storage: StorageAdapter) {
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
      if (!msg.isGroup) return await adapter.sendText(msg.chatJid, '❌ Group only command.');
      
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

  // 5. WARN COMMAND
  pipeline.registerCommand({
    name: 'warn',
    category: 'admin',
    description: 'Warn a user in the group',
    handler: async (msg, args, adapter: WhatsAppAdapter) => {
      if (!msg.isGroup) return await adapter.sendText(msg.chatJid, '❌ Group only command.');
      
      const metadata = await adapter.getGroupMetadata(msg.chatJid);
      const sender = metadata.participants.find(p => p.jid === msg.senderJid);
      if (!sender?.isAdmin) return await adapter.sendText(msg.chatJid, '❌ Only admins can use this.');

      const targetJid = msg.text?.match(/@(\d+)/)?.[1] 
        ? `${msg.text.match(/@(\d+)/)?.[1]}@s.whatsapp.net` 
        : args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;

      if (!targetJid) return await adapter.sendText(msg.chatJid, '❌ Tag a user or provide a number.');

      const count = await storage.addWarning(msg.chatJid, targetJid);
      await adapter.sendText(msg.chatJid, `⚠️ *Warned:* @${targetJid.split('@')[0]}\n*Total Warnings:* ${count}/3`);
      
      if (count >= 3) {
        await adapter.kickParticipant(msg.chatJid, targetJid);
        await adapter.sendText(msg.chatJid, `👢 Kicked @${targetJid.split('@')[0]} (3 warnings reached).`);
      }
    }
  });

  // 6. WARNINGS COMMAND
  pipeline.registerCommand({
    name: 'warnings',
    category: 'admin',
    description: 'Check warnings for a user',
    handler: async (msg, args, adapter: WhatsAppAdapter) => {
      if (!msg.isGroup) return await adapter.sendText(msg.chatJid, '❌ Group only command.');
      
      const targetJid = msg.text?.match(/@(\d+)/)?.[1] 
        ? `${msg.text.match(/@(\d+)/)?.[1]}@s.whatsapp.net` 
        : args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;

      if (!targetJid) return await adapter.sendText(msg.chatJid, '❌ Tag a user or provide a number.');
      
      const count = await storage.getWarnings(msg.chatJid, targetJid);
      await adapter.sendText(msg.chatJid, `*User has ${count}/3 warnings.*`);
    }
  });

  // 7. KICK COMMAND
  pipeline.registerCommand({
    name: 'kick',
    category: 'admin',
    description: 'Kick a user from the group',
    handler: async (msg, args, adapter: WhatsAppAdapter) => {
      if (!msg.isGroup) return await adapter.sendText(msg.chatJid, '❌ Group only command.');
      
      const metadata = await adapter.getGroupMetadata(msg.chatJid);
      const sender = metadata.participants.find(p => p.jid === msg.senderJid);
      if (!sender?.isAdmin) return await adapter.sendText(msg.chatJid, '❌ Only admins can use this.');

      const targetJid = msg.text?.match(/@(\d+)/)?.[1] 
        ? `${msg.text.match(/@(\d+)/)?.[1]}@s.whatsapp.net` 
        : args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;

      if (!targetJid) return await adapter.sendText(msg.chatJid, '❌ Tag a user or provide a number.');

      await adapter.kickParticipant(msg.chatJid, targetJid);
      await adapter.sendText(msg.chatJid, `👢 Kicked @${targetJid.split('@')[0]}`);
    }
  });
    }
