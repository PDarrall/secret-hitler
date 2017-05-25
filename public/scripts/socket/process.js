'use strict';

var Socket = require('socket/socket');

var Cards = require('ui/cards');
var Chat = require('ui/chat');

var Util = require('util/util');

var Game = require('game/game');
var Players = require('game/players');
var Policies = require('game/policies');
var State = require('game/state');

var Audio = require('util/audio');

//LOCAL

var processAction = function(data) {
	var action = data.action;
	if (action == 'abandoned') {
		Players.abandoned(data);
	} else if (action == 'chat') {
//		Audio.chatAlert();
		Chat.addMessage(data); 
	} else if (action == 'chancellor chosen') {
		Audio.chancellorChosenAlert();
		Players.chancellorChosen(data);
	} else if (action == 'voted') {
//		Audio.votedAlert();
		Game.voteCompleted(data);
	} else if (action == 'discarded') {
		Policies.discarded(data);
	} else if (action == 'enacted') {
		Audio.enactedAlert();
		Policies.enacted(data);
	} else if (action == 'veto requested') {
		Policies.vetoRequest(data);
	} else if (action == 'vetoed') {
		Game.failedGovernment(data.forced, 'Election vetoed');
	} else if (action == 'veto overridden') {
		Policies.vetoOverridden(data);
	} else {
		if (data.canVeto) {
			State.canVeto = true;
		}
		if (action == 'peek') {
			Policies.returnPreviewed();
			Chat.addAction('peeked the next three policies', State.getPresident());
		} else {
			var target = Players.get(data.uid);
			if (action == 'investigate') {
				target.investigated = true;
				if (State.isLocalPresident()) {
					Players.displayAvatar(target, data.secret.party);
				}
				Chat.addAction('investigated ' + Util.nameSpan(target), State.getPresident());
			} else if (action == 'special election') {
				State.specialPresidentIndex = target.index;
			} else if (action == 'bullet') {
				Players.kill(target, data.hitler, false);
				Chat.addAction('killed ' + Util.nameSpan(target), State.getPresident());
			}
		}
		Cards.show(null);
		Game.advanceTurn();
	}
	if (data.roles) {
		Players.revealRoles(data.roles);
	}
};

//SOCKET

Socket.on('game action', processAction);

Socket.on('action error', function(data) {
	window.alert('Unable to perform that last action: ' + data + '. Please try reloading the page and trying again.\n\nOtherwise, your game may be an in state where you can\'t continue. If so, please file a bug with the relevant information so I can get it fixed! You can do so via the "FEEDBACK" button in the game\'s menu. Thank you!');
});

//PUBLIC

module.exports = {

	history: function(history) {
		State.rewinding = true;
		history.forEach(function(action) {
			processAction(action);
		});
		State.rewinding = false;
	},

};
