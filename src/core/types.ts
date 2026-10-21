addWarning(groupJid: string, userJid: string): Promise<number>;
getWarnings(groupJid: string, userJid: string): Promise<number>;
resetWarnings(groupJid: string, userJid: string): Promise<void>;
