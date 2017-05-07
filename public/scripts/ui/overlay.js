'use strict';

require('styles/ui/overlay');

var $ = require('jquery');

var CommonGame = require('common/game');

var Cards = require('ui/cards');
var Chat = require('ui/chat');

var Socket = require('socket/socket');

var Util = require('util/util');

var Players = require('game/players');
var State = require('game/state');

//LOCAL

var hideOverlay = function() {
	$('#game-mat').removeClass('overlay');
	$('#overlay').fadeOut();
	Cards.hide('role');
};

var showOverlaySection = function(name) {
	$('#overlay .toggle-section').hide();
	$('#overlay-' + name).show();
};

var showOverlay = function(type, data) {
	setTimeout(function() {
		$('#game-mat').addClass('overlay');
	}, 0);
	$('#overlay').fadeIn();
	var showInfo = type != 'menu' && type != 'feedback';
	showOverlaySection(showInfo ? 'info' : type);

	var inner = '';
	var extras = '';

	// Start
	if (type == 'start') {
		extras += '<div class="tip top">game status ⤴︎</div>';
		extras += '<div class="tip bottom left">⤹ chat box</div>';
		extras += '<div class="tip bottom right">menu⤵︎</div>';

		inner += '<h2><em>your secret role:</em></h2>';
		inner += '<div class="avatar image '+Players.roleClass(State.localRole)+'"></div>';
		inner += '<h1>'+State.localRoleName()+'</h1>';
		var fascistsCount = CommonGame.fascistsCount(State.playerCount) - 1;
		var fascistsDescription = Util.pluralize(fascistsCount, 'Fascist') + ' + Hitler';
		inner += '<h4>'+State.playerCount+' players (' + fascistsDescription + ')</h4>';
		inner += '<p>';

		inner += 'Your objective is to ';
		if (CommonGame.isLiberal(State.localRole)) {
			inner += 'work together with the other Liberals and pass 5 Liberal policies, or assassinate Hitler with one of the Fascist bullet policies.';
		} else if (!CommonGame.isFuehrer(State.localRole)) {
			inner += 'work together with the other Fascists to enact 6 Fascist policies, or elect Hitler as Chancellor <strong>after the third</strong> Fascist policy has been enacted.';
		} else {
			inner += 'discover the other Fascists, working together to enact 6 Fascist policies, or get yourself elected Chancellor <strong>after the third</strong> Fascist policy has been enacted.<br>As Hitler, you\'ll want to keep yourself out of suspicion to avoid being assassinated.';
		}
		inner += '</p><h3>Good luck!</h3>';

	// Game over
	} else if (type == 'victory') {
		var liberalVictory = data.liberals;
		if (liberalVictory === null) {
			inner += '<h1>Game Abandoned</h1>';
			inner += '<h3>Sorry, too many players quit the game to continue :(</h3>';
		} else {
			var winName = liberalVictory ? 'Liberal' : 'Fascist';
			Chat.addAction(winName + ' win!');

			inner += '<h1>'+winName+'s win!</h1>';
			inner += '<h3>';
			if (data.method == 'policies') {
				var winCount = liberalVictory ? State.enactedLiberal : State.enactedFascist;
				inner += winName+' enacted '+winCount+' '+winName+' policies';
			} else if (data.method == 'hitler') {
				if (liberalVictory) {
					inner += 'The Liberals successfully found and killed Hitler';
				} else {
					inner += 'The Fascists successfully elected Hitler as Chancellor after the third Fascist policy';
				}
			} else if (data.method == 'hitler quit') {
				inner += 'The Liberals successfully scared Hitler out of his Thumb Bunker (quit the game)';
			} else if (State.playerCount <= 3) {
				if (data.method == 'bullet') {
					inner += 'Hitler successfully killed one of the two Liberal players';
				} else if (data.method == 'quit') {
					inner += 'A Liberal quit the game, leaving too few players remaining :(';
				}
				inner += '</h3><h3>';
				inner += '(special win condition for 3 player)';
			}
			inner += '</h3><p><hr></p><button class="menu-feedback large">give feedback</button>';
		}
	}

	inner += '<button id="overlay-continue" class="large" data-type="'+type+'">continue</button>';
	$('#overlay .info').html(inner);
	$('#overlay .extras').html(extras);
};

$('#overlay').on('click', '#overlay-continue', function() {
	hideOverlay();
});

//MENU

$('#menu-issues').on('click', function() {
	window.open('https://github.com/kylecoburn/secret-hitler/issues', '_blank');
});

$('#overlay').on('click', '.menu-feedback', function() {
	showOverlaySection('feedback');
});

$('#menu-about').on('click', function() {
	showOverlaySection('about');
});

$('#menu-quit').on('click', function() {
	var confirmed = true;
	if (State.started && !State.finished) {
		confirmed = window.confirm('Are you sure you want to abandon this game?', 'Your fellow players will be sad, and you\'ll lose points :(');
	}
	if (confirmed) {
		require('lobby/lobby').quitToLobby();
	}
});

$('#menu-cancel').on('click', function() {
	hideOverlay();
});

//FEEDBACK

$('.menu-back').on('click', function() {
	showOverlaySection('menu');
});

$('#feedback-submit').on('click', function() {
	var type = $('#i-feedback-type').val();
	if (!type) {
		window.alert('Please select a type of feedback to report and try again!');
		return;
	}
	var body = $('#i-feedback-body').val();
	if (body.length < 6) {
		window.alert('Please enter some feedback into the text area!');
		return;
	}
	Socket.emit('feedback', {type: type, body: body}, function(response) {
		if (response) {
			$('#i-feedback-type').val('default');
			$('#i-feedback-body').val('');
			showOverlaySection('menu');
			window.alert('Thank you! Your feedback has been recorded.');
		}
	});
});

//PUBLIC

module.exports = {

	hide: hideOverlay,

	show: showOverlay,

};
