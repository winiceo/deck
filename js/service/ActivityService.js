/*
 * @copyright Copyright (c) 2018 Julius Härtl <jus@bitgrid.net>
 *
 * @author Julius Härtl <jus@bitgrid.net>
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 */

import app from '../app/App.js';

const DECK_ACTIVITY_TYPE_BOARD = 'deck_board';
const DECK_ACTIVITY_TYPE_CARD = 'deck_card';

/* global OC oc_requesttoken */
class ActivityService {

	constructor ($rootScope, $filter, $http, $q) {
		this.running = false;
		this.runningNewer = false;
		this.$filter = $filter;
		this.$http = $http;
		this.$q = $q;
		this.data = {};
		this.data[DECK_ACTIVITY_TYPE_BOARD] = {};
		this.data[DECK_ACTIVITY_TYPE_CARD] = {};
		this.since = {
			deck_card: {

			},
			deck_board: {

			},
		}
	}

	static getUrl(type, id, since) {
		if (type === DECK_ACTIVITY_TYPE_CARD)
			return OC.linkToOCS('apps/activity/api/v2/activity', 2) + 'filter?format=json&object_type=deck_card&object_id=' + id + '&limit=5&since=' + since;
		if (type === DECK_ACTIVITY_TYPE_BOARD)
			return OC.linkToOCS('apps/activity/api/v2/activity', 2) + 'deck?format=json&limit=5&since=' + since;
	}

	fetchCardActivities(type, id, since) {
		this.running = true;

		this.checkData(type, id);
		var self = this;
		return this.$http.get(ActivityService.getUrl(type, id, since)).then(function (response) {
			var objects = response.data.ocs.data;

			var dataLengthBefore = self.data[type][id].length;
			for (let index in objects) {
				let item = objects[index];
				self.addItem(type, id, item);
				if (item.activity_id > self.since[type][id].latest) {
					self.since[type][id].latest = item.activity_id;
				}
			}
			var dataLengthAfter = self.data[type][id].length;
			self.data[type][id].sort(function(a, b) {
				return b.activity_id - a.activity_id;
			});
			self.since[type][id].oldest = response.headers('X-Activity-Last-Given');
			self.running = false;
		}, function (error) {
			if (error.status === 304) {
				self.since[type][id].finished = true;
			}
			self.running = false;
		});
	}
	fetchMoreActivities(type, id) {
		this.checkData(type, id);
		if (this.running === true) {
			return this.runningPromise;
		}
		if (!this.since[type][id].finished) {
			this.runningPromise = this.fetchCardActivities(type, id, this.since[type][id].oldest);
			return this.runningPromise;
		}
		return Promise.reject();
	}
	checkData(type, id) {
		if (!Array.isArray(this.data[type][id])) {
			this.data[type][id] = [];
		}
		if (typeof this.since[type][id] === 'undefined') {
			this.since[type][id] = {
				latest: 0,
				oldestCatchedUp: false,
				oldest: '0',
				finished: false,
			};
		}
	}

	addItem(type, id, item) {
		if (this.data[type][id].findIndex((entry) => { return entry.activity_id === item.activity_id; }) === -1) {
			if (type === DECK_ACTIVITY_TYPE_BOARD && (
				(item.object_type === DECK_ACTIVITY_TYPE_CARD && item.subject_rich[1].board && item.subject_rich[1].board.id !== id)
				|| (item.object_type === DECK_ACTIVITY_TYPE_BOARD && item.object_id !== id)
			)) {
				return;
			}
			item.timestamp = new Date(item.datetime).getTime();
			this.data[type][id].push(item);
		}
	}

	/**
	 * Fetch newer activities starting from the latest ones that are in cache
	 *
	 * @param type
	 * @param id
	 */
	fetchNewerActivities(type, id) {
		if (this.since[type][id].latest === 0) {
			return Promise.resolve();
		}
		let self = this;
		return this.fetchNewer(type, id).then(function() {
			return self.fetchNewerActivities(type, id);
		});
	}

	fetchNewer(type, id) {
		var deferred = this.$q.defer();
		this.running = true;
		this.runningNewer = true;
		var self = this;
		this.$http.get(ActivityService.getUrl(type, id, this.since[type][id].latest) + '&sort=asc').then(function (response) {
			var objects = response.data.ocs.data;

			let data = [];
			for (let index in objects) {
				let item = objects[index];
				self.addItem(type, id, item);
			}
			self.data[type][id].sort(function(a, b) {
				return b.activity_id - a.activity_id;
			});
			self.since[type][id].latest = response.headers('X-Activity-Last-Given');
			self.data[type][id] = data.concat(self.data[type][id]);
			self.running = false;
			self.runningNewer = false;
			deferred.resolve(objects);
		}, function (error) {
			self.runningNewer = false;
			self.running = false;
		});
		return deferred.promise;
	}

	getData(type, id) {
		if (!Array.isArray(this.data[type][id])) {
			return [];
		}
		return this.data[type][id];
	}

};

app.service('ActivityService', ActivityService);

export default ActivityService;
export {DECK_ACTIVITY_TYPE_BOARD, DECK_ACTIVITY_TYPE_CARD};
