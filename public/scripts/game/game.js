'use strict';

require('styles/game/game');
require('styles/ui/board');

var $ = require('jquery');

var CommonGame = require('common/game');

var App = require('ui/app');
var Cards = require('ui/cards');
var Chat = require('ui/chat');
var Overlay = require('ui/overlay');

var Util = require('util/util');

var State = require('game/state');
var Policies = require('game/policies');

//FINISH

var endGame = function(liberalWin, winMethod) {
	if (State.inGame) {
		State.inGame = false;
		State.finished = true;
		Chat.toggleMute(false);
		Chat.setDirective('GAME OVER');
		Overlay.show('victory', {liberals: liberalWin, method: winMethod});
	}
};

//TURNS

var playTurn = function() {
	$('.player-slot').removeClass('elect');

	var president = State.getPresident();
	App.playerDiv(president).addClass('elect');
	App.enablePlayerSelection('special election');

	var directive;
	if (State.isLocalPresident()) {
		directive = 'Choose your Chancellor';
	} else {
		directive = 'President ' + Util.nameSpan(president) + ' to nominate their chancellor';
	}
	Cards.show(null);
	Chat.setDirective(directive);
};

var advanceTurn = function() {
	Chat.setEnacting(false);
	if (State.finished) {
		return;
	}
	if (State.specialPresidentIndex != null) {
		State.presidentIndex = State.specialPresidentIndex;
		State.specialPresidentIndex = null;
	} else {
		State.presidentIndex = CommonGame.getNextPresident(State.playerCount, State.players, State.positionIndex);
		State.positionIndex = State.presidentIndex;
	}

	State.presidentPower = null;
	State.chancellorIndex = null;

	playTurn();
};

//VOTES

var updateElectionTracker = function() {
	$('.tracker-slot').removeClass('selected');
	$('.tracker-slot').eq(State.electionTracker).addClass('selected');
};

var resetElectionTracker = function() {
	State.electionTracker = 0;
	updateElectionTracker();
};

var advanceElectionTracker = function(forcedPolicy) {
	if (forcedPolicy) {
		State.presidentElect = 0;
		State.chancellorElect = 0;
		State.electionTracker = 0;
		Policies.enact(forcedPolicy);
		Policies.draw(1);
		Policies.checkRemaining();
	} else {
		++State.electionTracker;
	}
	updateElectionTracker();
};

var failedGovernment = function(forced, explanation) {
	advanceElectionTracker(forced);
	var directive = explanation + ', ';
	if (State.electionTracker == 0) {
		directive += '3 failed elections enacts the top policy on the deck D:';
		Chat.addAction('Failed 3 governments ('+forced+' enacted)');
	} else {
		Chat.addAction('Failed government ('+State.electionTracker+' of 3)');
		if (State.electionTracker == 2) {
			directive += 'one more and the top policy on the deck will be enacted!';
		} else {
			directive += 'advancing the election tracker and passing on the presidency';
		}
	}
	Chat.setDirective(directive);
	advanceTurn();
};

var voteCompleted = function(data) {
	var directive, cards = null;
	var voteDivs = $('.player-slot .vote');
	data.supporters.forEach(function(support, index) {
		voteDivs.eq(index).show().text(support ? 'Ja!' : 'Nein!');
	});

	if (data.hitler) {
		endGame(false, 'hitler');
	} else if (data.elected) {
		State.presidentElect = State.getPresident().uid;
		State.chancellorElect = State.getChancellor().uid;

		Chat.setEnacting(State.inGovernment());
		Policies.draw(3);

		if (State.isLocalPresident()) {
			Policies.updateChoices(data.secret.policies);
			cards = 'policy';
			directive = 'Choose a policy to <strong>discard</strong>';
		} else {
			directive = 'President ' + Util.nameSpan(State.getPresident()) + ' to discard a policy';
		}
		Chat.setDirective(directive);
	} else {
		failedGovernment(data.forced, 'Election does not pass');
	}
	Cards.show(cards);
};

//PUBLIC

module.exports = {

	end: endGame,

	advanceTurn: advanceTurn,

	playTurn: playTurn,

	failedGovernment: failedGovernment,

	voteCompleted: voteCompleted,

	advanceElectionTracker: advanceElectionTracker,

	resetElectionTracker: resetElectionTracker,

};
