'use strict';

require('styles/ui/cards');

var $ = require('jquery');

var Action = require('socket/action');

var State = require('game/state');

//LOCAL

var hideCards = function(hideName) {
	$('#cards-'+hideName).hide();
};

var showCards = function(showName) {
	$('#player-cards > *').hide();
	$('#cards-'+showName).show();

	if (showName == 'vote') {
		$('#cards-vote .card').removeClass('selected');
	} else if (showName == 'policy') {
		$('#veto-request').toggle(State.canVeto && State.isLocalChancellor());
	}
};

//EVENTS

$('#cards-vote').on('click', '.card', function() {
	var jqThis = $(this);
	var canceling = jqThis.hasClass('selected');
	Action.emit('vote', {up: canceling ? null : this.id == 'card-ja'}, function() {
		$('#cards-vote .card').removeClass('selected');
		if (!canceling) {
			jqThis.addClass('selected');
		}
	});
});

$('#cards-policy').on('click', '.card', function() {
	if (State.presidentPower && State.presidentPower.indexOf('peek') > -1) {
		Action.emit(State.presidentPower);
	} else {
		var data = {};
		if ($(this).data('veto')) {
			data.veto = $(this).data('veto') == true;
		} else {
			data.policyIndex = $(this).data('index');
		}
		Action.emit('policy', data);
	}
});

$('#cards-veto').on('click', '.card', function() {
	Action.emit('policy', {veto: $(this).data('veto') == true});
});

$('#mobile-tabs').on('click', 'a', function(e) {
	$('#mobile-tabs a').removeClass('selected');
	$(e.currentTarget).addClass('selected');

	var isChat = $.trim(e.currentTarget.text) == "Chat";

	$('#players').toggle(!isChat);
	$('#chat-container-game').toggle(isChat);
});

//PUBLIC

module.exports = {

	hide: hideCards,

	show: showCards,

};
