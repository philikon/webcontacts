
if (!window.indexedDB) {
	if (typeof mozIndexedDB != "undefined") indexedDB = mozIndexedDB;
	else if (typeof webkitIndexedDB != "undefined") indexedDB = webkitIndexedDB;
	else throw new Error("No IndexedDB implementation available");
}

var LOG_ERROR = 3;
var LOG_WARN = 2;
var LOG_DEBUG = 1;

var DB_VERSION = "0.2";

var REFRESH_FINISHED = "refresh_finished";
var ACTIVITY_FINISHED = "activity_finished";
var DISCOVERY_FINISHED = "discovery_finished";

var ACT_OBJSTORE = "activities";
var ACT_DATEIDX = "actdateidx";

function logErrorFn(server, msg) {
	return function(event) {
		server.log(LOG_ERROR, msg, event);
	}
}

function ContactServer()
{
	this._fatalError = false;
	this._sources = [];
	this._observers = [];
	return this;
}

ContactServer.prototype =
{
	_init: function(readyFn, deleteAllRecords)
	{
		var self = this;
		var request = indexedDB.open("Contacts");
		request.onerror = function(event) {
			this.log(LOG_ERROR, "Unable to open database", event);
			this._fatalError = true;
		}
		request.onsuccess = function(event) {
			self._db = event.target.result;
			console.log("Assigned self._db to " + self._db)
			var targetReadyFn = readyFn;
			if (deleteAllRecords) {
				targetReadyFn = function() {
					self._deleteAll(readyFn);
				}
			}
			self._checkVersion(targetReadyFn);
		}
	},

	_deleteAll: function(callback) {
		try {
			var self = this;
			var transaction = this._db.transaction(["contacts", ACT_OBJSTORE], IDBTransaction.READ_WRITE);
			var request = transaction.objectStore("contacts").clear();
			request.onsuccess = function() {
				var request2=transaction.objectStore(ACT_OBJSTORE).clear();
				request2.onsuccess = callback;
				request2.onerror = logErrorFn(self, "Unable to clear activities object store");
			}
			request.onerror = logErrorFn(self, "Unable to delete contacts object store");
		} catch (e) {
			this.log(LOG_ERROR, "Unable to delete contacts object store: " + e);
		}
	},

	/* Make sure the database is the current version;
	 * also, if no version is found, create the initial database. */
	_checkVersion: function(readyFn) {
		this.log(LOG_DEBUG, "Current Contacts database version is " + this._db.version);
		if (this._db.version === "") {
			this.log(LOG_DEBUG, "No database found; creating a new one");
			this._createDatabase(readyFn);
		}
		else if (this._db.version != DB_VERSION) {
			this.log(LOG_DEBUG, "Updating database from version " + this._db.version + " to " + DB_VERSION);			
			this._updateDatabase(readyFn);
		} else {
			this.log(LOG_DEBUG, "Database is already version " + DB_VERSION);
			if (readyFn) readyFn();
		}
	},

	_updateDatabase: function(readyFn) {
		// Do whatever is needful...
		var self = this;
		var request = this._db.setVersion(DB_VERSION);
		request.onerror = function(event) {
			self.log(LOG_ERROR, "Unable to set database version during updateDatabase", event);
			this._fatalError = true;
		}
		request.onsuccess = function(event) {
			self.log(LOG_DEBUG, "Updated database to " + DB_VERSION, event);
			if (!self._db.objectStoreNames.contains("contacts")) {
				self.log(LOG_DEBUG, "Creating contacts object store");
				var contactObjectStore = self._db.createObjectStore("contacts");//, {keyPath: "source.id"});
			} else {
				var transaction = self._db.transaction(["contacts"], 1) ;//IDBTransaction.READ_WRITE);
				var contactObjectStore = transaction.objectStore("contacts");		
			}

			if (readyFn) readyFn();
		}		
	},

	_createDatabase: function(readyFn) {
		var self = this;
		var request = this._db.setVersion(DB_VERSION);
		request.onerror = function(event) {
			self.log(LOG_ERROR, "Unable to set database version", event);
			self._fatalError = true;
		}
		request.onsuccess = function(event) {
			console.log("Creating Contacts object store");
			try {
				var contactObjectStore = self._db.createObjectStore("contacts");
			} catch (e) {
				self.log(LOG_ERROR, "Unable to create contacts store: " + e);
			}
			try {
				var activitiesObjectStore = self._db.createObjectStore(ACT_OBJSTORE);
			} catch (e) {
				self.log(LOG_ERROR, "Unable to create activities store: " + e);
			}
			try {
				var dateIndex = activitiesObjectStore.createIndex(ACT_DATEIDX, "date", {});
			} catch (e) {
				self.log(LOG_ERROR, "Unable to create activities date index: " + e);
			}

			// I want to do:
			// var contactEmailIndex = contactObjectStore.createIndex("email", "emails", {multirow:true, unique:false});
			// But I can't Ffx hasn't implemented multirow (see http://mxr.mozilla.org/mozilla-central/source/dom/indexedDB/IDBObjectStore.cpp#1444)

			if (readyFn) readyFn();
		}
	},

	_makeContactRTrans: function makeContactTrans(caller) {
		var self = this;
		var transaction = this._db.transaction(["contacts"], 0); //IDBTransaction.READ);
		transaction.oncomplete = function(event) {
			self.log(LOG_DEBUG, "Completed " + caller + " transaction", event)
		}
		transaction.onerror = function(event) {
			self.log(LOG_WARN, "Error in "  + caller + " transaction", event);
		}
		return transaction;
	},
	_makeContactRWTrans: function makeContactTrans(caller) {
		var self = this;
		var transaction = this._db.transaction(["contacts"], 1) ;//IDBTransaction.READ_WRITE);
		transaction.oncomplete = function(event) {
			self.log(LOG_DEBUG, "Completed " + caller + " transaction", event)
		}
		transaction.onerror = function(event) {
			self.log(LOG_WARN, "Error in "  + caller + " transaction", event);
		}
		return transaction;
	},
	_makeActivityRWTrans: function makeActivityRWTrans(caller) {
		var self = this;
		var transaction = this._db.transaction([ACT_OBJSTORE], 1) ;//IDBTransaction.READ_WRITE);
		transaction.oncomplete = function(event) {
			self.log(LOG_DEBUG, "Completed " + caller + " transaction", event)
		}
		transaction.onerror = function(event) {
			self.log(LOG_WARN, "Error in "  + caller + " transaction", event);
		}
		return transaction;
	},


	_getKey: function(aContact) {
		if (aContact.source && aContact.id != undefined) {
			return aContact.source + "." + aContact.id;
		} else {
			// uh oh
			throw new Error("Contact is missing required source and id attributes: " + JSON.stringify(aContact));
		}
	},

	_mergeRecords: function(dest, src) {

		function mergeToList(destList, srcItem) {
			for (var idx in destList) {
				if (destList[idx].value == srcItem.value) {
					// yes, match; check for other metadata?
					return;
				}
			}
			destList.push(srcItem);
		}

		if (src.frecency) console.log("Got frecency " + src.frecency + " for " + src.displayName + " (" + src.source + ")");
		for (var i in src) {
			if (src.hasOwnProperty(i)) {
				if (i == "source") continue;
				if (i == "id") continue;
				if (i == "frecency") {
					if (dest.frecency) dest.frecency += src.frecency;
					else dest.frecency = src.frecency;
					continue;
				}
				if (i == "displayName") { // take the one with spaces
					if (dest.displayName) {
						var srcCt = src.displayName.split(" ").length;
						var destCt = dest.displayName.split(" ").length;
						if (srcCt > destCt) {
							dest.displayName = src.displayName;
						}
					} else {
						dest.displayName = src.displayName;						
					}
					continue;
				}

				if (src[i].constructor.name == "Array") {
					if (!dest[i]) dest[i] = src[i];
					else {
						for (var idx in src[i]) {
							mergeToList(dest[i], src[i][idx]);
						}
					}
				} else {
					if (!dest[i]) dest[i] = src[i];
				}
			}
		}
		if (src.sources) {
			for (var i in src.sources) {
				if (dest.sources.indexOf(src.sources[i]) < 0) {
					dest.sources.push(src.sources[i]);
				}
			}
		}
		else dest.sources.push(this._getKey(src));
	},

	_mergeContactList: function(contactList) {

		// For each contact
		//   For each email address
		//     If it's a match

		// Output is:
		//   Array of PoCo objects containing unified data with "sources" array containing IDs

		// Map values are output records
		var emailMap = {};
		var accountMap = {};
		var displayNameMap = {};
		var newRecords = [];

		function addKeysForContact(aContact, matchTarget) {
			for (var eIdx in aContact.emails) {
				var em = aContact.emails[eIdx].value;
				if (!emailMap[em]) {
					emailMap[em] = matchTarget;
				}
			}
			if (aContact.accounts) {
				for (var acIdx in aContact.accounts) {
					var key = aContact.accounts[acIdx].domain + ":" + aContact.accounts[acIdx].userid;
					if (!accountMap[key]) {
						accountMap[key] = matchTarget;
					}
				}
			}
			if (!displayNameMap[aContact.displayName]) {
				displayNameMap[aContact.displayName] = matchTarget;
			}
		}
		
		for (var cIdx in contactList)
		{
			var matched = null;
			var c = contactList[cIdx];

			for (var eIdx in c.emails)
			{
				var v = c.emails[eIdx].value;
				if (v && emailMap[v]) {
					if (matched) { // already matched one; this is a join so collapse them together
						this._mergeRecords(emailMap[v], c);
						this._mergeRecords(matched, emailMap[v]); 
						emailMap[v].drop = true;
						emailMap[v] = matched; // copy the pointer
						// dupes in the sources list
						// incorrect data in newRecords array
					} else {
						// first match:
						this._mergeRecords(emailMap[v], c);
						matched = emailMap[v];
					}
				}
			}
			for (var acIdx in c.accounts)
			{
				var key = c.accounts[acIdx].domain + ":" + c.accounts[acIdx].userid;
				if (accountMap[key]) {
					if (matched) { // already matched one; this is a join so collapse them together
						this._mergeRecords(accountMap[key], c);
						this._mergeRecords(matched, accountMap[key]);
						accountMap[key].drop = true;
						accountMap[key] = matched; // copy the pointer
						// dupes in the sources list
						// incorrect data in newRecords array
					} else {
						// first match:
						this._mergeRecords(accountMap[key], c);
						matched = accountMap[key];
					}
				}
			}			
			// Perhaps a name match then?
			if (!matched) {
				if (c.displayName && displayNameMap[c.displayName]) {
					this._mergeRecords(displayNameMap[c.displayName], c);
					matched = displayNameMap[c.displayName];
				}
			}
			// Record any new keys from c that we might want later:
			if (matched) {
				addKeysForContact(c, matched);
				continue;
			}

			// No matches on anything, so this is new: make a destination
			// record and copy everything over, and put it in the lookups.
			var newRec = {};
			
			// Copy all fields except the source and ID, which will turn into the key...
			for (var i in c) {
				if (c.hasOwnProperty(i)) {
					if (i == "source") continue;
					if (i == "id") continue;
					newRec[i] = c[i];
				}
			}
			newRec.sources = [];
			newRec.sources.push(this._getKey(c));
			newRecords.push(newRec);
			addKeysForContact(c, newRec);
		}
		var out = [];
		for (var i in newRecords) {
			if (!newRecords[i].drop) out.push(newRecords[i]);
		}
		return out;
	},

	_addContacts: function(contacts, callback) {
		var transaction = this._makeContactRWTrans("_addContacts");
		if (callback) transaction.onsuccess = callback;
		var objStore = transaction.objectStore("contacts");
		for (var i in contacts) {
			var aContact = contacts[i];
			if (i < 2) console.log("_addContacts sniff: " + JSON.stringify(aContact));
			try {
				var key = this._getKey(aContact)
				var request = objStore.put(aContact, key);
			} catch (e) {
				if (e.code == 25) { // recover from security clone error
					var request = objStore.put(JSON.parse(JSON.stringify(aContact)), key);
				} else {
					console.log("Error while inserting " + key + ": " + e + "; data is: " + JSON.stringify(aContact));
					throw e;
				}
			}
			
		}
	},

	_addContact: function(contact) {
		this._addContacts([contact]);
	},

	_removeContacts: function(contacts) {
		var transaction = this._makeContactRWTrans();
		var objStore = transaction.objectStore("contacts");
		for (var i in contacts) {
			var aContact = contacts[i];
			var request = objStore.delete(this._getKey(aContact));
		}
	},
	_removeContact: function(contact) {
		this._removeContacts([contact]);
	},


	_getContactByID: function(source, id, callback) {
		var transaction = this._makeContactRTrans("_addContacts");
		var objStore = transaction.objectStore("contacts");
		var request = objStore.get(source + "." + id);
		request.onerror = function(event) {
			console.log("getContactByID error")
			callback(null);
		}
		request.onsuccess = function(event) {
			console.log("getContactByID success: " + source + "/" + id + " got " + event.target.result );
			callback(event.target.result);
		}
	},
	_get: function(filter, callback) {
		var transaction = this._makeContactRTrans("_get");
		var objStore = transaction.objectStore("contacts");
		var request = objStore.openCursor();
		var result = [];
		request.onsuccess = function(event) {
			var cursor = event.target.result;  
			if (cursor) {  
				result.push(cursor.value);  
				cursor.continue();  
			}  
			else {  
				callback(result);
			}  		
		}
	},
	
	_addActivities: function(activities, callback) {
		var transaction = this._makeActivityRWTrans("_addActivities");
		var objStore = transaction.objectStore(ACT_OBJSTORE);
		if (callback) transaction.onsuccess = callback;
		for (var i in activities) {
			var anActivity = activities[i];
			try {
				// what's the activity key?
				var key = anActivity.date + anActivity.title;
				var request = objStore.put(anActivity, key);
			} catch (e) {
				if (e.code == 25) { // recover from security clone error
					var request = objStore.put(JSON.parse(JSON.stringify(anActivity)), key);
				} else {
					console.log("Error while inserting " + key + ": " + e + "; data is: " + JSON.stringify(anActivity));
					throw e;
				}
			}
			
		}
	},

	_addActivity: function(activity, callback) {
		this._addActivities([activity], callback);
	},

	//	Public methods:
	log: function(level, message, event) {
		var LEVEL_STR = ["", "D ", "W ", "E "];
		if (typeof event != "undefined") {
			if (typeof event.target != "undefined" && typeof event.target.result != "undefined") {
				console.log(LEVEL_STR[level] + message + "; " + event.target.result);
			} else if (typeof event.message != "undefined") {
				console.log(LEVEL_STR[level] + message + "; " + event.message);
			} else {
				console.log(LEVEL_STR[level] + message);
			}
		} else {
			console.log(LEVEL_STR[level] + message);
		}
	},
	init: function(readyFn, deleteAllRecords) {
		this._init(readyFn, deleteAllRecords);
	},
	addObserver: function(observer) {
		this._observers.push(observer);
	},
	addContact: function(contact) {
		this._addContact(contact);
	},
	addContacts: function(contacts, callback) {
		this._addContacts(contacts, callback);
	},
	removeContact: function(contact) {
		this._removeContact(contact);
	},
	removeContacts: function(contacts) {
		this.removeContacts(contacts);
	},
	getContactByID: function(source, id, callback) {
		this._getContactByID(source, id, callback);
	},
	get: function(filter, callback) {
		this._get(filter, callback);
	},
	getMerged: function(filter, callback) {
		var self=this;
		this._get(filter, function(result) {
			var merged = self._mergeContactList(result);
			callback(merged);
		})	
	},
	addSource: function(source) {
		this._sources.push(source);
	},
	refreshAll: function() {
		console.log("Refresh all sources");
		for (var i in this._sources) {
			console.log("Refresh " + this._sources[i]);
			this._sources[i].refresh(this);
		}
	},
	getActivity: function(contact) {
		/*for (var i in this._sources) {
			if (this._sources[i].getActivity) {
				this._sources[i].getActivity(contact, this);
			}
		}*/
	},
	updateAllActivity: function(contact) {
		for (var i in this._sources) {
			if (this._sources[i].getActivity) {
				this._sources[i].getActivity(contact, this);
			}
		}		
	},
	getRecentActivity: function(filter, callback) {
		console.log("getRecentActivity");
		var transaction = this._makeActivityRWTrans("_getRecentActivity"); //XX should be R
		var objStore = transaction.objectStore(ACT_OBJSTORE);
		//var request = objStore.index(ACT_DATEIDX).openCursor();
		var request = objStore.openCursor();
		var result = [];
		var startTime = new Date();
		request.onsuccess = function(event) {
			var cursor = event.target.result;  
			if (cursor) {  
				result.push(cursor.value);  
				cursor.continue();  
			}  
			else {  
				var stopTime = new Date();
				console.log("GetRecentActivity: " + (stopTime - startTime) + " ms");
				callback(result);
			}  		
		}		
	},
	addActivity: function(contact, activity, source) {
		if (!contact.activities) contact.activities = [];
		contact.activities = contact.activities.concat(activity);
		contact.activities = contact.activities.sort(function(a,b) {
			if (typeof a.date == "string") a.date = new Date(a.date);
			if (typeof b.date == "string") b.date = new Date(b.date);
			return a.date-b.date;
		});
		this.notify(ACTIVITY_FINISHED, source);
	},
	
	discoverContact: function(contact) {
		var self=  this;
		function doDiscovery(i) {
			if (self._sources[i].discover) {
				var aSource = self._sources[i];
				aSource.discover(contact, function(result) {
					if (!result.source) console.log("Discovery result missing required 'source'");
					else if (!result.id) console.log("Discovery result missing required 'id'");
					else {
						console.log("Discovery result for " + contact.sources[0] + ": " + JSON.stringify(result));
						self._addContact(result);
						self.notify(DISCOVERY_FINISHED, aSource, contact);
					}
				});
			}
		}
		for (var i in this._sources) {
			try {
				doDiscovery(i);	
			} catch (e) {
				this.log(LOG_WARN, "Error while performing discovery with " + this._sources + ": " + e);
			}
		}				
	},
	// Called by a source when it has finished a refresh
	refreshFinished: function(source) {
		this.notify(REFRESH_FINISHED, source)
	},
	updateRecentActivity: function(filter, callback) {
		var self = this;
		for (var i in self._sources) {
			if (self._sources[i].getRecentActivity) {
				console.log("Calling getRecentActivity for " + self._sources[i]);
				self._sources[i].getRecentActivity(function(activities) {
					self._addActivities(activities);
					callback();
				});
			}
		}
	},
	updateContactScoring: function(callback) {
		var self = this;
		self.getRecentActivity({}, function(acts) {
			self.get({}, function(contacts) {

				console.log("Preparing contact scoring: got " + contacts.length + "contacts and " + acts.length + " activities");
				
				var emailMap = {};
				for (var i in contacts) {
					var c = contacts[i];
					c.frecency = 0;
					if (c.emails) {
						for (var e in c.emails) {
							emailMap[c.emails[e].value] = c;
						}
					}
				}


				for (var a in acts) {
					var act = acts[a];
					if (act.author) {
						if (emailMap[act.author]) {
							emailMap[act.author].frecency += 1; // should be time-loaded
						}
					}
				}				

				var toUpdate = [];
				for (var i in contacts) {
					if (contacts[i].frecency > 0) {
						toUpdate.push(contacts[i]);
					}
				}
				console.log("Finished scanning contact scoring: got " + toUpdate.length + "items to update");
				if (toUpdate.length > 0) {
					self.addContacts(toUpdate, callback);
				} else {
					if (callback) callback();
				}				
			});
		});
	},
	notify: function(subject, data) {
		for (var i in this._observers) {
			this._observers[i].observe(subject, data);
		}
	}
}

function ContactServerObserver()
{
	return this;
}
ContactServerObserver.prototype =
{
	observe: function(subject, data) {}
}


