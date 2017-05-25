'use strict';

var DB = require.main.require('./server/tools/db');
var Utils = require.main.require('./server/tools/utils');

var Game = require.main.require('./server/play/game');
var Player = require.main.require('./server/play/player');

//LOCAL

var openNewGameFor = function(startSocket, size, isPrivate) {
	new Game(null, size, isPrivate, startSocket);
};

var joinGameById = function(socket, gid) {
	var oldGame = socket.game;
	if (!oldGame || oldGame.finished) {
		var game = Game.get(gid);
		if (game) {
			if (game.started) {
				return 'started';
			}
			if (game.isFull()) {
				return 'full';
			}
			if (game.isOpen()) {
				game.addPlayer(socket);
				return true;
			}
		}
	}
	return false;
};

var joinOngoingGame = function(socket) {
	var oldGame = socket.game;
	if (oldGame && !oldGame.finished) {
		oldGame.addPlayer(socket);
		return true;
	}
};

var joinAvailableGame = function(socket) {
	var games = Game.games();
	for (var idx = 0; idx < games.length; idx += 1) {
		var game = games[idx];
		if (game.isOpenPublic()) {
			game.addPlayer(socket);
			return true;
		}
	}
	return false;
};

var leaveOldGame = function(socket) {
	var oldGame = socket.game;
	if (oldGame) {
		oldGame.disconnect(socket);
	}
};

//PUBLIC

module.exports = function(socket) {

	socket.on('lobby join', function(data, callback) {
		leaveOldGame(socket);
		Game.emitLobby(socket);

		if (!joinOngoingGame(socket)) {
			if (!data || !data.join || joinGameById(socket, data.join) == false) {
				socket.join('lobby');
			}
		}
	});

	socket.on('lobby afk', function(data, callback) {
		if (socket.game) {
			socket.game.resetAutostart();
		}
	});

	socket.on('room create', function(data, callback) {
		if (!Player.data(socket.uid, 'joining')) {
			leaveOldGame(socket);
			var gameMaxSize = Utils.rangeCheck(data.size, 5, 10, 10);
			openNewGameFor(socket, gameMaxSize, data.private);
		}
	});

	socket.on('room quickjoin', function(data, callback) {
		var response = {};
		if (joinOngoingGame(socket)) {
			response.gid = socket.game.gid;
		} else {
			if (!Player.data(socket.uid, 'joining')) {
				response.success = true;
				if (!joinAvailableGame(socket)) {
					openNewGameFor(socket, 10, false);
				}
			}
		}
		callback(response);
	});

	socket.on('room join', function(data, callback) {
		var response = {};
		var gid = data.gid;
		if (!gid) {
			response.error = 'Invalid game code';
		} else {
			var joined = joinGameById(socket, data.gid);
			if (joined == 'full') {
				response.error = 'Game full';
			} else if (joined == 'started') {
				response.error = 'Game started';
			} else if (joined == true) {
				response.success = true;
			} else {
				response.error = 'Game not found';
			}
		}
		callback(response);
	});

	socket.on('feedback', function(data, callback) {
		var gid;
		if (socket.game) {
			gid = socket.game.gid;
		}
		DB.insert('feedback', {user_id: socket.uid, game_id: gid, username: socket.name, report_type: data.type, feedback: data.body}, null, callback);
	});

};
