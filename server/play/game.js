'use strict';

var CommonConsts = require.main.require('./common/constants');
var CommonUtil = require.main.require('./common/util');
var CommonGame = require.main.require('./common/game');

var SeedRandom = require('seedrandom');

var DB = require.main.require('./server/tools/db');
var Utils = require.main.require('./server/tools/utils');

var Socket = require.main.require('./server/connect/io');

var Player = require.main.require('./server/play/player');

//LOCAL

var MINIMUM_GAME_SIZE = Utils.TESTING ? 3 : 5;

var games = [];
var lobbyGames, lobbyPlayers;

var conpleteSetup = function(game, gid, socket) {
	game.gid = gid;
	game.generator = new SeedRandom(gid);
	games.push(game);
	if (socket) {
		game.addPlayer(socket);
	}
};

var emitLobby = function(target) {
	if (!target) {
		lobbyGames = games.filter(function(game) {
			return game.isOpenPublic();
		}).map(function(game) {
			return {
				gid: game.gid,
				names: game.playersStateMap('name').join('・'),
				size: game.maxSize,
			};
		});

		var playerSockets = Player.all();
		var onlineCount = 0, playingCount = 0, lobbyCount = 0;
		for (var suid in playerSockets) {
			var socket = playerSockets[suid];
			onlineCount += 1;
			if (socket.game) {
				if (socket.game.started && !socket.game.finished) {
					playingCount += 1;
				}
			} else {
				lobbyCount += 1;
			}
		}
		lobbyPlayers = {
			online: onlineCount,
			playing: playingCount,
			lobby: lobbyCount,
		};
	}

	if (!target) {
		target = Socket.to('lobby');
	}
	target.emit('lobby games stats', {games: lobbyGames, players: lobbyPlayers});
};

var Game = function(restoreData, size, privateGame, socket) {
	var game = this;
	if (restoreData) {
		this.replaying = true;
		this.players = restoreData.player_ids.split(',');
		this.playersState = {};
		var names = restoreData.player_names.split(',');
		this.players.forEach(function(puid, index) {
			game.playersState[puid] = {index: index, name: names[index]};
		});
		this.history = restoreData.history || [];
		this.startIndex = restoreData.start_index;
		this.playerCount = restoreData.player_count;

		conpleteSetup(this, restoreData.id, socket);
	} else {
		this.maxSize = size;
		this.private = privateGame;

		this.players = [];
		this.history = [];
		this.playersState = {};

		this.started = false;
		this.autoTimer = null;
		this.scheduledStart = null;

		this.startIndex = null;
		this.playerCount = null;
		this.currentCount = null;
		this.policyDeck = null;
		this.power = null;

		this.positionIndex = null;
		this.specialPresidentIndex = null;

		if (socket) {
			Player.data(socket.uid, 'joining', true);
		}
		DB.gid(function(gid) {
			if (socket) {
				Player.data(socket.uid, 'joining', false);
			}
			conpleteSetup(game, gid, socket);
			DB.insert('games', {id: gid, version: CommonConsts.VERSION, compatible_version: CommonConsts.COMPATIBLE_VERSION});
			emitLobby();
		});
	}

	this.finished = false;
	this.enactedLiberal = 0;
	this.enactedFascist = 0;
	this.electionTracker = 0;

	this.turn = {};

//PRIVATE

	this.random = function(span) {
		return Utils.rngInt(this.generator, span);
	};

	this.shuffle = function(array) {
		return Utils.randomize(this.generator, array);
	};

	this.shufflePolicyDeck = function() {
		this.policyDeck = [];

		var cardsRemaining = 17 - this.enactedFascist - this.enactedLiberal;
		var liberalsRemaining = 6 - this.enactedLiberal;
		for (var i = 0; i < cardsRemaining; ++i) {
			this.policyDeck[i] = i < liberalsRemaining ? CommonConsts.LIBERAL : CommonConsts.FASCIST;
		}
		this.policyDeck = this.shuffle(this.policyDeck);
	};

	this.playersStateMap = function(key) {
		return this.players.map(function(puid) {
			return game.playerState(puid, key);
		});
	};

//POLICIES

	this.peekPolicies = function() {
		return this.policyDeck.slice(0, 3);
	};

	this.getTopPolicies = function(count) {
		if (!count) {
			count = 3;
		}
		if (this.policyDeck == null) {
			console.error(this.gid, 'Policy deck null', this.history.length);
			this.shufflePolicyDeck();
		}
		var policies = this.policyDeck.splice(0, count);
		if (this.policyDeck.length < 3) {
			this.shufflePolicyDeck();
		}
		return policies;
	};

	this.getTopPolicy = function() {
		return this.getTopPolicies(1)[0];
	};

//LOBBY

	this.emit = function(name, data) {
		Socket.to(this.gid).emit(name, data);
	};

	this.emitExcept = function(exceptUid, name, data) {
		this.players.forEach(function(puid) {
			if (puid != exceptUid) {
				Player.emitTo(puid, name, data);
			}
		});
	};

	this.emitAction = function(name, data, secret) {
		data.action = name;
		if (this.finished && name != 'chat') {
			data.roles = this.playersStateMap('role');
		}
		if (secret) {
			var tuid = secret.target;
			this.emitExcept(tuid, 'game action', data);
			data.secret = secret;
			Player.emitTo(tuid, 'game action', data);
		} else {
			this.emit('game action', data);
		}
		this.lastAction = data;
		this.lastError = null;
		return data;
	};

	this.gameData = function(perspectiveUid) {
		var sendHistory = this.history;
		var sendPlayers = [];
		var showFascists;
		if (perspectiveUid) {
			var perspectiveRole = this.playerState(perspectiveUid, 'role');
			if (CommonGame.isFuehrer(perspectiveRole)) {
				showFascists = this.playerCount <= 6;
			} else {
				showFascists = CommonGame.isFascist(perspectiveRole);
			}
		}
		this.players.forEach(function(uid, index) {
			var playerData = {
				uid: uid,
				name: game.playerState(uid, 'name'),
				index: index,
			};
			if (perspectiveUid) {
				var playerRole = game.playerState(uid, 'role');
				if (perspectiveUid == uid || (showFascists && CommonGame.isFascist(playerRole))) {
					playerData.role = playerRole;
				}
			}
			sendPlayers[index] = playerData;
		});
		return {
			gid: this.gid,
			started: this.started,
			maxSize: this.maxSize,
			startIndex: this.startIndex,
			startTime: this.scheduledStart,

			players: sendPlayers,
			history: sendHistory,
			private: this.private,
		};
	};

	this.resetAutostart = function() {
		this.cancelAutostart();

		if (this.enoughToStart()) {
			var startDelay = Utils.TESTING ? 3 : 45;
			this.scheduledStart = CommonUtil.now() + startDelay;

			this.autoTimer = setTimeout(function() {
				game.start();
			}, startDelay * 1000);
		}

		this.emit('lobby game data', this.gameData());
	};

	this.cancelAutostart = function() {
		if (this.autoTimer) {
			clearTimeout(this.autoTimer);
			this.autoTimer = null;
			this.scheduledStart = null;
		}
	};

	this.emitStartPerspective = function(uid) {
		Player.emitTo(uid, 'lobby game data', this.gameData(uid));
	};

	this.start = function() {
		if (this.started) {
			return;
		}
		if (!this.replaying) {
			if (!this.enoughToStart()) {
				console.error(game.gid, 'Start sequence interrupted', this.players);
				this.resetAutostart();
				return;
			}
			this.cancelAutostart();
		}

		this.started = true;
		this.playerCount = this.players.length;
		this.currentCount = this.playerCount;
		this.startIndex = this.random(this.playerCount);
		this.positionIndex = this.startIndex;
		this.setPresidentIndex(this.positionIndex);
		this.shufflePolicyDeck();

		if (!this.replaying) {
			var idsData = this.players.join(',');
			var namesData = this.playersStateMap('name').join(',');
			DB.update('games', "id = '"+this.gid+"'", {state: 1, started_at: CommonUtil.now(), start_index: this.startIndex, player_count: this.playerCount, player_ids: idsData, player_names: namesData});
			DB.updatePlayers(this.players, 'started', this.gid, true);
		}

		// Assign Fascists
		var facistsCount = CommonGame.fascistsCount(this.playerCount);
		var fascistIndicies = [2];
		for (var i = 1; i < this.playerCount; ++i) {
			fascistIndicies[i] = i < facistsCount ? 1 : 0;
		}
		fascistIndicies = this.shuffle(fascistIndicies);
		this.players.forEach(function(puid, pidx) {
			var role = fascistIndicies[pidx];
			game.playerState(puid, 'role', role);
		});

		// Emit
		this.players.forEach(function(puid) {
			game.emitStartPerspective(puid);
		});

		if (this.history) {
			require.main.require('./server/play/play').process(game);
		}
		this.replaying = false;

		emitLobby();
	};

	this.getFascistPower = function() {
		return CommonGame.getFascistPower(this.enactedFascist, this.playerCount);
	};

//STATE

	this.setPresidentIndex = function(index) {
		this.turn.president = this.players[index];
	};

	this.advanceTurn = function() {
		if (this.finished) {
			return;
		}
		this.turn = {};
		if (this.specialPresidentIndex != null) {
			this.setPresidentIndex(this.specialPresidentIndex);
			this.specialPresidentIndex = null;
		} else {
			this.positionIndex = CommonGame.getNextPresident(this.playerCount, this.players, this.positionIndex, this.playersState);
			this.setPresidentIndex(this.positionIndex);
		}
		this.power = null;
	};

	this.failedElection = function() {
		++this.electionTracker;
		var forcedPolicy;
		if (this.electionTracker >= 3) {
			this.electionTracker = 0;
			this.presidentElect = null;
			this.chancellorElect = null;
			forcedPolicy = this.getTopPolicy();
			this.enactPolicy(forcedPolicy, false);
		}
		this.advanceTurn();
		return forcedPolicy;
	};

	this.finish = function(liberals, method) {
		if (!this.finished) {
			console.log(game.gid, 'FIN', liberals, method);

			var activePlayers = this.players.filter(function(puid) {
				return !game.playerState(puid, 'quit');
			});
			DB.updatePlayers(activePlayers, 'finished', null, true);

			this.finished = true;
			DB.update('games', "id = '"+this.gid+"'", {state: 2, finished_at: CommonUtil.now(), history: JSON.stringify(this.history), history_count: this.history.length, enacted_liberal: this.enactedLiberal, enacted_fascist: this.enactedFascist, liberal_victory: liberals, win_method: method});
		}
	};

	this.enactPolicy = function(policy, byVote) {
		var fascistPower;
		this.electionTracker = 0;
		if (policy == CommonConsts.LIBERAL) {
			++this.enactedLiberal;
			if (this.enactedLiberal >= CommonConsts.LIBERAL_POLICIES_REQUIRED) {
				this.finish(true, 'policy');
				return;
			}
		} else {
			++this.enactedFascist;
			if (this.enactedFascist >= CommonConsts.FASCIST_POLICIES_REQUIRED) {
				this.finish(false, 'policy');
				return;
			}
			fascistPower = this.getFascistPower();
		}
		if (byVote) {
			if (fascistPower) {
				this.power = fascistPower;
			} else {
				this.advanceTurn();
			}
		}
		return fascistPower;
	};

//PLAYERS

	this.playerState = function(puid, key, value) {
		var state = this.playersState[puid];
		if (state && key) {
			if (value === undefined) {
				return state[key];
			}
			state[key] = value;
		}
		return state;
	};

	this.addPlayer = function(socket) {
		var uid = socket.uid;
		socket.leave('lobby');
		socket.join(this.gid);
		Player.setGame(socket, this);

		var playerState = this.playerState(uid);
		if (!playerState) {
			var index = this.players.length;
			this.players[index] = uid;
			this.playersState[uid] = {index: index, name: socket.name};
		} else {
			playerState.quit = false;
		}

		if (this.started) {
			this.emitStartPerspective(uid);
			emitLobby();
		} else if (this.isFull()) {
			this.start();
		} else {
			this.resetAutostart();
			emitLobby();
		}
	};

	this.kill = function(uid, quitting) {
		var playerState = this.playerState(uid);
		if (playerState && !playerState.killed) {
			if (quitting) {
				playerState.quit = true;
				if (!this.replaying) {
					DB.updatePlayers([uid], 'quit', null, !this.finished);
				}
			}
			playerState.killed = true;
			this.currentCount -= 1;

			if (!this.finished && this.isFuehrer(uid)) {
				this.finish(true, quitting ? 'hitler quit' : 'hitler');
			} else if (this.currentCount <= 2) {
				this.removeSelf();
			}
			return true;
		}
	};

	this.removeSelf = function() {
		this.cancelAutostart();

		var gid = this.gid;
		games = games.filter(function(g) {
			return g.gid != gid;
		});
		if (!this.finished) {
			DB.delete('games', 'id = $1', [gid]);
		}
	};

	this.disconnect = function(socket) {
		if (!this.started || this.finished) {
			this.remove(socket);
		} else {
			this.playerState(socket.uid, 'disconnected', true);
		}
	};

	this.remove = function(socket, uid) {
		if (socket) {
			socket.leave(this.gid);
			uid = socket.uid;
		}

		var playerState = this.playerState(uid);
		if (!playerState || playerState.quit) {
			return false;
		}
		if (this.started) {
			playerState.quit = true;
			this.kill(uid, !this.finished);
		} else {
			this.players = this.players.filter(function(puid) {
				return puid != uid;
			});
			delete this.playersState[uid];
			if (this.players.length == 0) {
				this.removeSelf();
			} else {
				this.players.forEach(function(puid, pidx) {
					game.playerState(puid, 'index', pidx);
				});
			}
			emitLobby();
		}
		if (socket) {
			Player.setGame(socket, null);
		}

		if (!this.started) {
			this.resetAutostart();
		}
		return true;
	};

//HELPERS

	this.error = function(description, puid, data) {
		if (description == this.lastError) {
			if (this.lastAction) {
				console.error('\nGE', this.gid, puid, description, data);
				console.log(this.lastAction);
				console.log('');
				this.lastAction = null;
				Player.emitTo(puid, 'action error', description);
			} else {
				this.emit('action error', description);
			}
			this.lastError = null;
		} else {
			this.lastError = description;
		}
	};

	this.addToHistory = function(step, save) {
		this.history.push(step);
		if (save) {
			DB.update('games', "id = '"+this.gid+"'", {history: JSON.stringify(this.history), history_count: this.history.length});
		}
	};

	this.isChancellor = function(uid) {
		return uid == this.turn.chancellor;
	};

	this.isPresident = function(uid) {
		return uid == this.turn.president;
	};

	this.fuehrerRemaining = function() {
		for (var idx = 0; idx < this.players.length; idx += 1) {
			var puid = this.players[idx];
			if (this.isFuehrer(puid) && !this.playerState(puid, 'killed')) {
				return true;
			}
		}
	};

	this.isFuehrer = function(uid) {
		var role = this.playerState(uid, 'role');
		return role && CommonGame.isFuehrer(role) ? role : false;
	};

	this.enoughToStart = function() {
		return this.players.length >= MINIMUM_GAME_SIZE;
	};

	this.isFull = function() {
		return this.players.length >= this.maxSize;
	};

	this.isOpen = function() {
		return this.gid != null && !this.started && !this.isFull();
	};

	this.isOpenPublic = function() {
		return !this.private && this.isOpen();
	};

	return this;
};

Game.games = function() {
	return games;
};

Game.get = function(gid) {
	for (var idx = 0; idx < games.length; idx += 1) {
		var game = games[idx];
		if (game.gid == gid) {
			return game;
		}
	}
};

Game.existsFor = function(socket) {
	if (socket.game == null) {
		var sharedGid = Player.data(socket.uid, 'gid');
		if (!sharedGid) {
			return Player.data(socket.uid, 'joining');
		}
		socket.game = Game.get(sharedGid);
	}
	return socket.game != null;
};

Game.emitLobby = emitLobby;

module.exports = Game;
