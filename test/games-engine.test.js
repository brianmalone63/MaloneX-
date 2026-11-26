import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newTttState, joinTtt, tttMove, findBestTttMove, tttWinner, tttDraw, renderTttBoard, TTT_AI,
  newWcgState, joinWcg, startWcg, submitWcgWord, eliminateWcg, formatWcgScores,
  newDiceState, joinDice, diceRoll
} from '../src/core/games/engine.js';

const PLAYER = '254700000001@s.whatsapp.net';
const OTHER = '254700000002@s.whatsapp.net';

test('tic tac toe joins, moves, detects a winner and clears the board state', () => {
  const state = newTttState(PLAYER);
  assert.equal(state.status, 'waiting');

  const joined = joinTtt(state, OTHER);
  assert.equal(joined.error, undefined);
  assert.equal(state.status, 'active');
  assert.equal(state.currentTurn, PLAYER);

  // Once a game is active nobody can join again.
  assert.equal(joinTtt(state, OTHER).error, 'not_waiting');

  // X wins the top row.
  assert.deepEqual(tttMove(state, PLAYER, 1).state.board[0], 'X');
  tttMove(state, OTHER, 4);
  tttMove(state, PLAYER, 2);
  tttMove(state, OTHER, 5);
  const final = tttMove(state, PLAYER, 3);
  assert.equal(final.winner, PLAYER);
  assert.equal(final.symbol, 'X');
  assert.equal(state.status, 'finished');
  assert.equal(tttWinner(state.board), 'X');
});

test('tic tac toe rejects wrong turns, taken cells and out of range moves', () => {
  const state = newTttState(PLAYER);
  joinTtt(state, OTHER);
  assert.equal(tttMove(state, OTHER, 1).error, 'not_your_turn');
  assert.equal(tttMove(state, PLAYER, 0).error, 'bad_position');
  assert.equal(tttMove(state, PLAYER, 10).error, 'bad_position');
  tttMove(state, PLAYER, 1);
  assert.equal(tttMove(state, OTHER, 1).error, 'cell_taken');
});

test('tic tac toe detects a draw and renders a stable board', () => {
  const state = newTttState(PLAYER);
  joinTtt(state, OTHER);
  // X: 5,9,7,2,4 - O: 1,3,8,6. A full board with no winning line.
  const seq = [[1, 5], [2, 1], [1, 9], [2, 3], [1, 7], [2, 8], [1, 2], [2, 6], [1, 4]];
  let result = null;
  for (const [player, pos] of seq) {
    const actor = player === 1 ? PLAYER : OTHER;
    result = tttMove(state, actor, pos);
  }
  assert.equal(result.draw, true);
  assert.equal(tttDraw(state.board), true);
  const board = renderTttBoard(state.board);
  assert.match(board, /O \| X \| O/);
  assert.match(board, /---\+---\+---/);
});

test('the tic tac toe AI blocks an immediate threat', () => {
  // X is about to win on the top row; O must take cell 3 (index 2).
  const board = ['X', 'X', 3, 'O', 5, 6, 7, 8, 'O'];
  assert.equal(findBestTttMove(board), 2);
});

test('the tic tac toe AI takes a winning move first', () => {
  const board = ['O', 'O', 3, 'X', 'X', 6, 7, 8, 9];
  assert.equal(findBestTttMove(board), 2);
});

test('word chain enforces turn, first letter, reuse, length and validity', () => {
  const state = newWcgState(PLAYER);
  assert.equal(joinWcg(state, PLAYER).error, 'cant_join_own_game');
  joinWcg(state, OTHER);
  assert.equal(startWcg(state).error, undefined);

  const validator = (word) => ['lime', 'mango', 'eagle'].includes(word);
  const opts = { validateWord: validator };

  assert.equal(submitWcgWord(state, OTHER, 'lime', opts).error, 'not_your_turn');
  assert.equal(submitWcgWord(state, PLAYER, 'zebra', opts).error, 'invalid_word');
  assert.equal(submitWcgWord(state, PLAYER, 'x', opts).error, 'too_short');

  const first = submitWcgWord(state, PLAYER, 'lime', opts);
  assert.equal(first.word, 'lime');
  assert.equal(first.nextPlayer, OTHER);

  // After "lime" the chain expects an E word; "mango" is rejected twice.
  assert.equal(submitWcgWord(state, OTHER, 'mango', opts).error, 'wrong_letter');
  assert.equal(submitWcgWord(state, OTHER, 'lime', opts).error, 'word_used');
  const second = submitWcgWord(state, OTHER, 'eagle', opts);
  assert.equal(second.word, 'eagle');
  assert.equal(state.scores[PLAYER], 4);
  assert.equal(state.scores[OTHER], 5);
});

test('word chain elimination leaves one winner and finished state', () => {
  const state = newWcgState(PLAYER);
  joinWcg(state, OTHER);
  startWcg(state);
  const result = eliminateWcg(state, OTHER);
  assert.equal(result.finished, true);
  assert.equal(result.winner, PLAYER);
  assert.equal(state.status, 'finished');
});

test('word chain scores format for display', () => {
  const text = formatWcgScores({ [PLAYER]: 4, [OTHER]: 5 });
  assert.match(text, /254700000001: 4 pts/);
  assert.match(text, /254700000002: 5 pts/);
});

test('dice joins, alternates rolls, scores rounds and finishes the match', () => {
  const state = newDiceState(PLAYER, 3);
  assert.equal(joinDice(state, PLAYER).error, 'same_player');
  joinDice(state, OTHER);

  const r1 = diceRoll(state, PLAYER, 5);
  assert.equal(r1.roll, 5);
  assert.equal(r1.waitingFor, OTHER);
  const r2 = diceRoll(state, OTHER, 3);
  assert.equal(r2.roundComplete, true);
  assert.equal(r2.roundWinner, PLAYER);
  assert.equal(r2.player1Score, 1);

  diceRoll(state, PLAYER, 2);
  const r4 = diceRoll(state, OTHER, 6);
  assert.equal(r4.roundWinner, OTHER);
  assert.equal(r4.player1Score, 1);
  assert.equal(r4.player2Score, 1);

  diceRoll(state, PLAYER, 6);
  const r6 = diceRoll(state, OTHER, 4);
  assert.equal(r6.gameFinished, true);
  assert.equal(r6.gameWinner, PLAYER);
  assert.equal(state.status, 'finished');
});

test('dice rejects rolls out of turn and clamps round count', () => {
  const state = newDiceState(PLAYER, 99);
  assert.equal(state.rounds, 10);
  joinDice(state, OTHER);
  assert.equal(diceRoll(state, OTHER, 4).error, 'not_your_turn');
});
