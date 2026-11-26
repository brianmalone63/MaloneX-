import { panel, notice } from '../core/format.js';
import {
  newTttState, joinTtt, tttMove, findBestTttMove, renderTttBoard, TTT_AI,
  newWcgState, joinWcg, startWcg, submitWcgWord, formatWcgScores,
  newDiceState, joinDice
} from '../core/games/engine.js';
import { getGame, saveGame, deleteGame } from '../core/games/store.js';
import { AI_PLAYER } from '../core/games/ai.js';
import { aiWcgMove } from '../core/features.js';

export default [
  {
    name: 'games',
    aliases: ['game'],
    description: 'Show how every MaloneX game works',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const lines = [
        'TicTacToe',
        `  ${ctx.prefix}tictactoe - open a table; another player types join`,
        `  ${ctx.prefix}tictactoe ai - play against the bot`,
        '  reply 1-9 to move, .tttend ends the table, .tttboard shows it',
        '',
        'Word Chain',
        `  ${ctx.prefix}wcg - open a chain; players type join`,
        `  ${ctx.prefix}wcgbegin - start (host), ${ctx.prefix}wcgend - end`,
        '  send a word starting with the last letter; longer words score more',
        `  ${ctx.prefix}wcgai - play against the bot`,
        '',
        'Dice',
        `  ${ctx.prefix}dice - open a best-of-3 match; opponent types join`,
        '  both players type roll each round; .diceend cancels',
        `  ${ctx.prefix}diceai - play against the bot`
      ];
      await ctx.reply(panel('MaloneX games', lines));
    }
  },

  // ---------- TicTacToe ----------
  {
    name: 'tictactoe',
    aliases: ['ttt'],
    description: 'Start TicTacToe in this chat (add ai for a bot opponent)',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const existing = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (existing) {
        await ctx.reply(notice('A game is already running here. End it with .tttend first.'));
        return;
      }
      const vsAi = /^ai|bot$/i.test(ctx.argText.trim());
      const state = newTttState(ctx.sender, { isAi: vsAi });
      await saveGame(ctx.store, ctx.session.id, ctx.jid, state);
      if (vsAi) {
        await ctx.reply(panel('TicTacToe vs AI', [
          'You are X, the AI is O.',
          '',
          renderTttBoard(state.board),
          '',
          'Reply with a number 1-9 to move.'
        ]));
        return;
      }
      await ctx.reply(panel('TicTacToe', [
        `Host: +${ctx.sender.split('@')[0]} (X)`,
        'Waiting: another player must type join.',
        '',
        renderTttBoard(state.board)
      ]));
    }
  },
  {
    name: 'tttjoin',
    aliases: ['jointtt'],
    description: 'Join a waiting TicTacToe game',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'ttt') {
        await ctx.reply(notice('No TicTacToe game is waiting here. Start one with .tictactoe.'));
        return;
      }
      const result = joinTtt(game, ctx.sender);
      if (result.error) {
        await ctx.reply(notice('That game cannot be joined.'));
        return;
      }
      await saveGame(ctx.store, ctx.session.id, ctx.jid, result.state);
      await ctx.sock.sendMessage(ctx.jid, {
        text: panel('TicTacToe', [
          `Player 1: +${result.state.player1.split('@')[0]} (X)`,
          `Player 2: +${result.state.player2.split('@')[0]} (O)`,
          '',
          renderTttBoard(result.state.board),
          '',
          `Turn: +${result.state.currentTurn.split('@')[0]}`,
          'Reply with a number 1-9 to move.'
        ]),
        mentions: [result.state.player1, result.state.player2]
      });
    }
  },
  {
    name: 'tttend',
    aliases: ['endttt'],
    description: 'End the current TicTacToe game',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'ttt') {
        await ctx.reply(notice('There is no TicTacToe game in this chat.'));
        return;
      }
      if (!ctx.superUser && game.player1 !== ctx.sender && game.player2 !== ctx.sender) {
        await ctx.reply(notice('Only a player or an owner can end this game.'));
        return;
      }
      await deleteGame(ctx.store, ctx.session.id, ctx.jid);
      await ctx.reply(notice('The TicTacToe game was ended.'));
    }
  },
  {
    name: 'tttboard',
    aliases: ['board'],
    description: 'Show the current TicTacToe board',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'ttt') {
        await ctx.reply(notice('There is no TicTacToe game in this chat.'));
        return;
      }
      await ctx.reply(panel('TicTacToe board', [renderTttBoard(game.board), '', `Turn: ${game.currentTurn ? `+${game.currentTurn.split('@')[0]}` : '-'} (X always moves first)`]));
    }
  },
  {
    name: 'tttai',
    aliases: ['tttbot'],
    description: 'Start TicTacToe against the bot',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const existing = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (existing) {
        await ctx.reply(notice('A game is already running here. End it with .tttend first.'));
        return;
      }
      const state = newTttState(ctx.sender, { isAi: true });
      await saveGame(ctx.store, ctx.session.id, ctx.jid, state);
      await ctx.reply(panel('TicTacToe vs AI', ['You are X, the AI is O.', '', renderTttBoard(state.board), '', 'Reply with a number 1-9 to move.']));
    }
  },

  // ---------- Word Chain ----------
  {
    name: 'wcg',
    aliases: ['wordchain'],
    description: 'Open a Word Chain game in this chat',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const existing = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (existing) {
        await ctx.reply(notice('A game is already running here. End it with .wcgend first.'));
        return;
      }
      const state = newWcgState(ctx.sender);
      await saveGame(ctx.store, ctx.session.id, ctx.jid, state);
      await ctx.reply(panel('Word Chain', [
        `Host: +${ctx.sender.split('@')[0]}`,
        'Others type join to enter.',
        'Host then runs .wcgbegin to start.',
        '',
        'Rules: each word must start with the last letter of the previous word, be a real word, and score points equal to its length.'
      ]));
    }
  },
  {
    name: 'wcgjoin',
    aliases: ['joinwcg'],
    description: 'Join the waiting Word Chain game',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'wcg') {
        await ctx.reply(notice('No Word Chain game is waiting here.'));
        return;
      }
      const result = joinWcg(game, ctx.sender);
      if (result.error === 'cant_join_own_game') {
        await ctx.reply(notice('You opened this game; you are already playing.'));
        return;
      }
      if (result.error === 'already_joined') {
        await ctx.reply(notice('You have already joined.'));
        return;
      }
      await saveGame(ctx.store, ctx.session.id, ctx.jid, result.state);
      await ctx.reply(notice(`+${ctx.sender.split('@')[0]} joined. ${result.state.players.length} players so far. Host runs .wcgbegin.`));
    }
  },
  {
    name: 'wcgbegin',
    aliases: ['startwcg'],
    description: 'Start the Word Chain game (host only)',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'wcg' || game.status !== 'waiting') {
        await ctx.reply(notice('No waiting Word Chain game found.'));
        return;
      }
      if (game.players[0] !== ctx.sender && !ctx.superUser) {
        await ctx.reply(notice('Only the host can start the game.'));
        return;
      }
      const result = startWcg(game);
      if (result.error) {
        await ctx.reply(notice('At least two players are needed. Others must type join first.'));
        return;
      }
      await saveGame(ctx.store, ctx.session.id, ctx.jid, result.state);
      await ctx.sock.sendMessage(ctx.jid, {
        text: panel('Word Chain started', [`Players: ${result.state.players.map((p) => `+${p.split('@')[0]}`).join(', ')}`, '', `Turn: +${result.state.currentTurn.split('@')[0]}`, 'Send any word to open the chain.']),
        mentions: [result.state.currentTurn]
      });
    }
  },
  {
    name: 'wcgend',
    aliases: ['endwcg'],
    description: 'End the Word Chain game and show the final scores',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'wcg') {
        await ctx.reply(notice('There is no Word Chain game in this chat.'));
        return;
      }
      await deleteGame(ctx.store, ctx.session.id, ctx.jid);
      await ctx.reply(panel('Word Chain ended', [formatWcgScores(game.scores)]));
    }
  },
  {
    name: 'wcgscores',
    aliases: ['wcgscore'],
    description: 'Show the current Word Chain scores',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'wcg') {
        await ctx.reply(notice('There is no Word Chain game in this chat.'));
        return;
      }
      await ctx.reply(panel('Word Chain scores', [
        formatWcgScores(game.scores),
        '',
        `Words played: ${game.usedWords.length}`,
        `Last word: ${game.lastWord || 'none'}`
      ]));
    }
  },
  {
    name: 'wcgai',
    aliases: ['wcgbot'],
    description: 'Play Word Chain against the bot',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const existing = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (existing) {
        await ctx.reply(notice('A game is already running here. End it with .wcgend first.'));
        return;
      }
      const state = newWcgState(ctx.sender);
      state.players.push(AI_PLAYER);
      state.scores[AI_PLAYER] = 0;
      state.status = 'active';
      state.currentTurn = ctx.sender;
      await saveGame(ctx.store, ctx.session.id, ctx.jid, state);
      await ctx.reply(panel('Word Chain vs AI', ['Send any word to open the chain. The AI answers after each of your words.']));
    }
  },

  // ---------- Dice ----------
  {
    name: 'dice',
    aliases: ['dicestart'],
    description: 'Open a best-of-3 dice match in this chat',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const existing = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (existing) {
        await ctx.reply(notice('A game is already running here. End it with .diceend first.'));
        return;
      }
      const rounds = Number.parseInt(ctx.args[0] || '3', 10) || 3;
      const state = newDiceState(ctx.sender, rounds);
      await saveGame(ctx.store, ctx.session.id, ctx.jid, state);
      await ctx.reply(panel('Dice', [
        `Host: +${ctx.sender.split('@')[0]}`,
        `Rounds: ${state.rounds}`,
        'Another player types join to start.'
      ]));
    }
  },
  {
    name: 'dicejoin',
    aliases: ['joindice'],
    description: 'Join the waiting dice match',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'dice' || game.status !== 'waiting') {
        await ctx.reply(notice('No dice match is waiting here.'));
        return;
      }
      const result = joinDice(game, ctx.sender);
      if (result.error) {
        await ctx.reply(notice('That match cannot be joined.'));
        return;
      }
      await saveGame(ctx.store, ctx.session.id, ctx.jid, result.state);
      await ctx.sock.sendMessage(ctx.jid, {
        text: panel('Dice started', [
          `+${result.state.player1.split('@')[0]} vs +${result.state.player2.split('@')[0]}`,
          `Rounds: ${result.state.rounds}`,
          '',
          `+${result.state.player1.split('@')[0]} types roll to begin.`
        ]),
        mentions: [result.state.player1, result.state.player2]
      });
    }
  },
  {
    name: 'diceend',
    aliases: ['enddice'],
    description: 'Cancel the dice match',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'dice') {
        await ctx.reply(notice('There is no dice match in this chat.'));
        return;
      }
      await deleteGame(ctx.store, ctx.session.id, ctx.jid);
      await ctx.reply(notice('The dice match was cancelled.'));
    }
  },
  {
    name: 'roll',
    aliases: ['diceroll'],
    description: 'Roll the dice in an active match',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const game = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (!game || game.kind !== 'dice' || game.status !== 'active') {
        await ctx.reply(notice('No dice match is active here. Start one with .dice.'));
        return;
      }
      if (game.player1 !== ctx.sender && game.player2 !== ctx.sender) {
        await ctx.reply(notice('Only the two players may roll.'));
        return;
      }
      const { diceRoll } = await import('../core/games/engine.js');
      const result = diceRoll(game, ctx.sender);
      if (result.error === 'not_your_turn') {
        await ctx.reply(notice(`It is +${game.currentTurn.split('@')[0]}'s turn.`));
        return;
      }
      if (result.error) {
        await ctx.reply(notice('That roll is not valid right now.'));
        return;
      }
      await saveGame(ctx.store, ctx.session.id, ctx.jid, result.state);
      const rows = [
        `Round ${result.currentRound} of ${game.rounds}`,
        `+${game.player1.split('@')[0]}: ${result.player1Roll ?? '-'}`,
        `+${game.player2.split('@')[0]}: ${result.player2Roll ?? '-'}`
      ];
      if (result.roundComplete || result.gameFinished) {
        if (result.roundWinner) rows.push(`Round winner: +${result.roundWinner.split('@')[0]}`);
        rows.push(`Score ${result.player1Score} : ${result.player2Score}`);
        if (result.gameFinished) {
          await deleteGame(ctx.store, ctx.session.id, ctx.jid);
          rows.push(result.gameWinner ? `Match winner: +${result.gameWinner.split('@')[0]}` : 'The match ended in a tie.');
        } else {
          rows.push('Type roll again for the next round.');
        }
      } else {
        rows.push(`Waiting for +${result.waitingFor.split('@')[0]} to roll.`);
      }
      await ctx.reply(panel('Dice', rows));
    }
  },
  {
    name: 'diceai',
    aliases: ['dicebot'],
    description: 'Play a dice match against the bot',
    category: 'Games',
    access: 'public',
    async run(ctx) {
      const existing = await getGame(ctx.store, ctx.session.id, ctx.jid);
      if (existing) {
        await ctx.reply(notice('A game is already running here. End it with .diceend first.'));
        return;
      }
      const rounds = Number.parseInt(ctx.args[0] || '3', 10) || 3;
      const state = newDiceState(ctx.sender, rounds);
      state.player2 = AI_PLAYER;
      state.status = 'active';
      state.currentTurn = ctx.sender;
      await saveGame(ctx.store, ctx.session.id, ctx.jid, state);
      await ctx.reply(panel('Dice vs AI', [`Rounds: ${state.rounds}`, 'Type roll to begin. The AI rolls right after you.']));
    }
  }
];
