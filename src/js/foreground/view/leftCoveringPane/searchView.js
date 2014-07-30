﻿define([
    'common/enum/listItemType',
    'foreground/view/behavior/multiSelect',
    'foreground/view/behavior/slidingRender',
    'foreground/view/behavior/sortable',
    'foreground/view/behavior/tooltip',
    'foreground/view/leftCoveringPane/searchResultView',
    'foreground/view/prompt/saveSongsPromptView',
    'text!template/search.html'
], function (ListItemType, MultiSelect, SlidingRender, Sortable, Tooltip, SearchResultView, SaveSongsPromptView, SearchTemplate) {
    'use strict';

    var StreamItems = chrome.extension.getBackgroundPage().StreamItems;
    var SignInManager = chrome.extension.getBackgroundPage().SignInManager;
    
    var SearchView = Backbone.Marionette.CompositeView.extend({
        id: 'search',
        className: 'left-pane',
        template: _.template(SearchTemplate),
        childViewContainer: '@ui.childContainer',
        childView: SearchResultView,
        
        //  Overwrite resortView to only render children as expected
        resortView: function () {
            this._renderChildren();
        },
        
        childViewOptions: {
            type: ListItemType.SearchResult
        },
        
        ui: {
            bottomMenubar: '.left-bottom-menubar',
            searchInput: '.search-bar input',
            searchingMessage: '.searching',
            instructions: '.instructions',
            noResultsMessage: '.no-results',
            bigTextWrapper: '.big-text-wrapper',
            childContainer: '#search-results',
            saveSelectedButton: '#save-selected',
            hideSearchButton: '#hide-search',
            playSelectedButton: '#play-selected',
            addSelectedButton: '#add-selected'
        },
        
        events: {
            'input @ui.searchInput': 'search',
            'click @ui.hideSearchButton': 'hide',
            'contextmenu @ui.childContainer': 'showContextMenu',
            'click @ui.playSelectedButton': 'playSelected',
            'click @ui.addSelectedButton': 'addSelected',
            'click @ui.saveSelectedButton': 'showSaveSelectedPrompt'
        },
        
        modelEvents: {
            'change:searchJqXhr change:searchQuery change:typing': 'toggleBigText'
        },

        collectionEvents: {
            'reset': 'toggleBigText',
            'change:selected': 'toggleBottomMenubar'
        },
 
        templateHelpers: function() {
            return {
                saveSelectedMessage: chrome.i18n.getMessage('saveSelected'),
                addSelectedMessage: chrome.i18n.getMessage('addSelected'),
                playSelectedMessage: chrome.i18n.getMessage('playSelected'),
                searchMessage: chrome.i18n.getMessage('search'),
                hideSearchMessage: chrome.i18n.getMessage('hideSearch'),
                startTypingMessage: chrome.i18n.getMessage('startTyping'),
                resultsWillAppearAsYouSearchMessage: chrome.i18n.getMessage('resultsWillAppearAsYouSearch'),
                searchingMessage: chrome.i18n.getMessage('searching'),
                noResultsFoundMessage: chrome.i18n.getMessage('noResultsFound'),
                sorryAboutThatMessage: chrome.i18n.getMessage('sorryAboutThat'),
                trySearchingForSomethingElseMessage: chrome.i18n.getMessage('trySearchingForSomethingElse'),
                cantSaveNotSignedInMessage: chrome.i18n.getMessage('cantSaveNotSignedIn')
            };
        },
        
        behaviors: function() {
            return {
                MultiSelect: {
                    behaviorClass: MultiSelect
                },
                SlidingRender: {
                    behaviorClass: SlidingRender
                },
                Sortable: {
                    behaviorClass: Sortable
                },
                Tooltip: {
                    behaviorClass: Tooltip
                }
            };
        },
        
        initialize: function () {
            this.listenTo(SignInManager, 'change:signedIn', this.toggleSaveSelected);
        },
 
        onRender: function () {
            this.toggleBigText();
            this.toggleBottomMenubar();
            this.toggleSaveSelected();
        },
        
        onShow: function () {
            this.model.stopClearResultsTimer();
            
            //  Reset val after focusing to prevent selecting the text while maintaining focus.
            this.ui.searchInput.focus().val(this.ui.searchInput.val());

            //  By passing undefined in I opt to use the default duration length.
            var transitionDuration = this.options.doSnapAnimation ? undefined : 0;

            this.$el.transition({
                x: this.$el.width()
            }, transitionDuration, 'snap');
        },

        onDestroy: function () {
            //  Remember search results for a bit just in case they close/re-open quickly, no need to re-search.
            this.model.startClearResultsTimer();
        },
        
        hide: function () {
            //  Transition the view back out before closing.
            this.$el.transition({
                //  Transition -20px off the screen to account for the shadow on the view.
                x: -20
            }, this.destroy.bind(this));
        },
        
        //  Searches youtube for song results based on the given text.
        search: function () {
            var searchQuery = $.trim(this.ui.searchInput.val());
            this.model.search(searchQuery);
        },
        
        toggleSaveSelected: function () {
            var signedIn = SignInManager.get('signedIn');
            this.ui.saveSelectedButton.toggleClass('disabled', !signedIn);

            var templateHelpers = this.templateHelpers();
            this.ui.saveSelectedButton.attr('title', signedIn ? templateHelpers.saveSelectedMessage : templateHelpers.cantSaveNotSignedInMessage);
        },
        toggleBottomMenubar: function () {
            var selectedCount = this.collection.selected().length;
            
            var extended = this.ui.bigTextWrapper.hasClass('extended');
            var doToggle = (extended && selectedCount > 0) || (!extended && selectedCount === 0);
            
            if (doToggle) {
                this.ui.bottomMenubar.toggle(selectedCount > 0);
                this.ui.bigTextWrapper.toggleClass('extended', selectedCount === 0);

                //  Need to update viewportHeight in slidingRender behavior:
                this.triggerMethod('ListHeightUpdated');
            }
        },

        //  Set the visibility of any visible text messages.
        toggleBigText: function () {
            //  Hide the search message when there is no search in progress nor any typing happening.
            var isNotSearching = this.model.get('searchJqXhr') === null && !this.model.get('typing');
            this.ui.searchingMessage.toggleClass('hidden', isNotSearching);
    
            //  Hide the instructions message once user has searched or are searching.
            var hasSearchResults = this.collection.length > 0;
            var hasSearchQuery = this.model.get('searchQuery').length > 0;
            this.ui.instructions.toggleClass('hidden', hasSearchResults || hasSearchQuery);

            //  Only show no results when all other options are exhausted and user has interacted.
            var hasNoResults = isNotSearching && hasSearchQuery && !hasSearchResults;
            this.ui.noResultsMessage.toggleClass('hidden', !hasNoResults);
        },
        
        playSelected: function () {
            StreamItems.addSongs(this.collection.getSelectedSongs(), {
                playOnAdd: true
            });
        },
        
        addSelected: function() {
            StreamItems.addSongs(this.collection.getSelectedSongs());
        },

        showSaveSelectedPrompt: function () {
            var disabled = this.ui.saveSelectedButton.hasClass('disabled');
            
            if (!disabled) {
                Backbone.Wreqr.radio.channel('prompt').vent.trigger('show', SaveSongsPromptView, {
                    songs: this.collection.getSelectedSongs()
                });
            }
            //  Don't close the menu if disabled
            return !disabled;
        },
        
        //  Shake the view to bring attention to the fact that the view is already visible.
        //  Throttled so that the animations can't stack up if shake is spammed.
        shake: _.throttle(function() {
            this.$el.effect('shake', {
                distance: 3,
                times: 3
            });
        }, 500)
    });

    return SearchView;
});