// Pure TicTacToe engine. Games are plain objects so they can be persisted as
// JSON documents and every transition is a pure function of the state.

export const TTT_AI = 'malonex-ai@s.whatsapp.net';

export function newTttState(host, { isAi = false } = {}) {
  return {
    kind: 'ttt',
    player1: host,
    player2: isAi ? TTT_AI : null,
    board: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    currentTurn: host,
    status: isAi ? 'active' : 'waiting',
    isAi
  };
}

export function joinTtt(state, player) {
  if (!state || state.kind !== 'ttt') return { error: 'no_game' };
  if (state.status !== 'waiting') return { error: 'not_waiting' };
  if (state.player1 === player) return { error: 'same_player' };
  state.player2 = player;
  state.status = 'active';
  state.currentTurn = state.player1;
  return { state };
}

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export function tttWinner(board) {
  for (const [a, b, c] of WIN_PATTERNS) {
    if (board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

export function tttDraw(board) {
  return board.every((cell) => cell === 'X' || cell === 'O');
}

export function tttMove(state, player, position) {
  if (!state || state.kind !== 'ttt' || state.status !== 'active') return { error: 'no_game' };
  if (state.currentTurn !== player) return { error: 'not_your_turn' };
  const pos = Number(position);
  if (!Number.isInteger(pos) || pos < 1 || pos > 9) return { error: 'bad_position' };
  const index = pos - 1;
  if (state.board[index] === 'X' || state.board[index] === 'O') return { error: 'cell_taken' };

  const symbol = player === state.player1 ? 'X' : 'O';
  state.board[index] = symbol;

  const winner = tttWinner(state.board);
  if (winner) {
    state.status = 'finished';
    return { state, winner: player, symbol };
  }
  if (tttDraw(state.board)) {
    state.status = 'finished';
    return { state, draw: true };
  }
  state.currentTurn = player === state.player1 ? state.player2 : state.player1;
  return { state };
}

// Heuristic AI: win now, block, take center, take a corner, else random.
export function findBestTttMove(board) {
  const empty = board.map((cell, i) => (typeof cell === 'number' ? i : -1)).filter((i) => i !== -1);
  if (empty.length === 0) return -1;

  const wouldWin = (b, player) =>
    WIN_PATTERNS.some(([a, x, c]) => b[a] === player && b[x] === player && b[c] === player);

  for (const i of empty) {
    const test = [...board];
    test[i] = 'O';
    if (wouldWin(test, 'O')) return i;
  }
  for (const i of empty) {
    const test = [...board];
    test[i] = 'X';
    if (wouldWin(test, 'X')) return i;
  }
  if (empty.includes(4)) return 4;
  const corners = [0, 2, 6, 8].filter((c) => empty.includes(c));
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
  return empty[Math.floor(Math.random() * empty.length)];
}

export function renderTttBoard(board) {
  const cell = (val) => String(val);
  return [
    ` ${cell(board[0])} | ${cell(board[1])} | ${cell(board[2])} `,
    '---+---+---',
    ` ${cell(board[3])} | ${cell(board[4])} | ${cell(board[5])} `,
    '---+---+---',
    ` ${cell(board[6])} | ${cell(board[7])} | ${cell(board[8])} `
  ].join('\n');
}

// Word Chain Game (WCG). Word validation is injected so tests can run offline
// and the plugin can plug a real dictionary service.
export function newWcgState(host) {
  return {
    kind: 'wcg',
    players: [host],
    currentTurn: null,
    lastWord: null,
    usedWords: [],
    scores: { [host]: 0 },
    status: 'waiting',
    turnTimeLimit: 30
  };
}

export function joinWcg(state, player) {
  if (!state || state.kind !== 'wcg') return { error: 'no_game' };
  if (state.status !== 'waiting') return { error: 'not_waiting' };
  if (state.players[0] === player) return { error: 'cant_join_own_game' };
  if (state.players.includes(player)) return { error: 'already_joined' };
  state.players.push(player);
  state.scores[player] = 0;
  return { state };
}

export function startWcg(state) {
  if (!state || state.kind !== 'wcg' || state.status !== 'waiting') return { error: 'no_game' };
  if (state.players.length < 2) return { error: 'not_enough_players' };
  state.status = 'active';
  state.currentTurn = state.players[0];
  return { state };
}

export function submitWcgWord(state, player, word, { validateWord } = {}) {
  if (!state || state.kind !== 'wcg' || state.status !== 'active') return { error: 'no_game' };
  if (state.currentTurn !== player) return { error: 'not_your_turn' };

  const clean = String(word || '').toLowerCase().trim();
  if (!/^[a-z]+$/.test(clean)) return { error: 'invalid_word' };
  if (clean.length < 2) return { error: 'too_short' };
  if (state.usedWords.includes(clean)) return { error: 'word_used' };
  if (state.lastWord) {
    const expected = state.lastWord.slice(-1).toLowerCase();
    if (clean[0] !== expected) return { error: 'wrong_letter', expected };
  }
  if (typeof validateWord === 'function' && !validateWord(clean)) {
    return { error: 'invalid_word' };
  }

  state.usedWords.push(clean);
  state.scores[player] = (state.scores[player] || 0) + clean.length;
  const index = state.players.indexOf(player);
  const nextPlayer = state.players[(index + 1) % state.players.length];
  state.lastWord = clean;
  state.currentTurn = nextPlayer;
  return { state, word: clean, nextPlayer, wordCount: state.usedWords.length };
}

// Remove a player (timeout). Returns the next state plus final standings when
// only one player remains.
export function eliminateWcg(state, player) {
  if (!state || state.kind !== 'wcg' || state.status !== 'active') return { error: 'no_game' };
  const index = state.players.indexOf(player);
  if (index === -1) return { error: 'player_not_found' };
  state.players.splice(index, 1);
  if (state.players.length === 1) {
    state.status = 'finished';
    return { state, finished: true, winner: state.players[0] };
  }
  if (state.players.length === 0) {
    state.status = 'finished';
    return { state, finished: true, winner: null };
  }
  if (!state.players.includes(state.currentTurn)) state.currentTurn = state.players[0];
  return { state, finished: false, nextPlayer: state.currentTurn };
}

export function formatWcgScores(scores) {
  return Object.entries(scores || {})
    .map(([player, score]) => `- ${player.split('@')[0]}: ${score} pts`)
    .join('\n');
}

// Dice game. Each round both players roll; higher roll scores a point.
export function newDiceState(host, rounds = 3) {
  return {
    kind: 'dice',
    player1: host,
    player2: null,
    player1Roll: null,
    player2Roll: null,
    currentTurn: null,
    rounds: Math.min(Math.max(Number(rounds) || 3, 1), 10),
    currentRound: 1,
    player1Score: 0,
    player2Score: 0,
    status: 'waiting',
    isAi: false
  };
}

export function joinDice(state, player) {
  if (!state || state.kind !== 'dice') return { error: 'no_game' };
  if (state.status !== 'waiting') return { error: 'not_waiting' };
  if (state.player1 === player) return { error: 'same_player' };
  state.player2 = player;
  state.status = 'active';
  state.currentTurn = state.player1;
  return { state };
}

export function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

export function diceRoll(state, player, roll = rollDice()) {
  if (!state || state.kind !== 'dice' || state.status !== 'active') return { error: 'no_game' };
  if (state.currentTurn !== player) return { error: 'not_your_turn' };

  const isPlayer1 = player === state.player1;
  if (isPlayer1) {
    state.player1Roll = roll;
    state.currentTurn = state.player2;
  } else {
    state.player2Roll = roll;
  }

  if (state.player1Roll !== null && state.player2Roll !== null) {
    let roundWinner = null;
    if (state.player1Roll > state.player2Roll) {
      state.player1Score += 1;
      roundWinner = state.player1;
    } else if (state.player2Roll > state.player1Roll) {
      state.player2Score += 1;
      roundWinner = state.player2;
    }
    const result = {
      state,
      player1Roll: state.player1Roll,
      player2Roll: state.player2Roll,
      roundWinner,
      player1Score: state.player1Score,
      player2Score: state.player2Score,
      currentRound: state.currentRound
    };

    if (state.currentRound >= state.rounds) {
      state.status = 'finished';
      let gameWinner = null;
      if (state.player1Score > state.player2Score) gameWinner = state.player1;
      else if (state.player2Score > state.player1Score) gameWinner = state.player2;
      return { ...result, gameFinished: true, gameWinner };
    }

    state.currentRound += 1;
    state.player1Roll = null;
    state.player2Roll = null;
    state.currentTurn = state.player1;
    return { ...result, roundComplete: true, nextRound: state.currentRound };
  }

  return { state, roll, waitingFor: state.currentTurn };
}
