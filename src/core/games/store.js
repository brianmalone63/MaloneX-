// Persistence for live games. One JSON document per chat in the "games"
// collection; every mutation writes back through the session store.

export async function getGame(store, sessionId, chatJid) {
  try {
    return await store.getDoc(sessionId, 'games', chatJid);
  } catch {
    return null;
  }
}

export async function saveGame(store, sessionId, chatJid, state) {
  await store.setDoc(sessionId, 'games', chatJid, state);
  return state;
}

export async function deleteGame(store, sessionId, chatJid) {
  try {
    await store.delDoc(sessionId, 'games', chatJid);
  } catch {
    // deleting a missing game is fine
  }
  return true;
}
