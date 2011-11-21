/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is WebContacts.
 *
 * The Initial Developer of the Original Code is
 * the Mozila Foundation
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Philipp von Weitershausen <philipp@weitershausen.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

//TODO
//
// - searching/filtering
// - sorting
// - audit all calls for exception handling

const DB_NAME = "contacts";
const DB_VERSION = 1;
const STORE_NAME = "contacts";


/**
 * ContactError
 */

const UNKNOWN_ERROR           = 0;
const INVALID_ARGUMENT_ERROR  = 1;
const TIMEOUT_ERROR           = 2;
const PENDING_OPERATION_ERROR = 3;
const IO_ERROR                = 4;
const NOT_SUPPORTED_ERROR     = 5;
const PERMISSION_DENIED_ERROR = 20;

function ContactError(code) {
  this.code = code;
}
ContactError.prototype = {
  UNKNOWN_ERROR:           UNKNOWN_ERROR,
  INVALID_ARGUMENT_ERROR:  INVALID_ARGUMENT_ERROR,
  TIMEOUT_ERROR:           TIMEOUT_ERROR,
  PENDING_OPERATION_ERROR: PENDING_OPERATION_ERROR,
  IO_ERROR:                IO_ERROR,
  NOT_SUPPORTED_ERROR:     NOT_SUPPORTED_ERROR,
  PERMISSION_DENIED_ERROR: PERMISSION_DENIED_ERROR
};


function debug() {
  dump(Array.join(arguments, " "));
}

function generateUI() {
  //TODO make this a lazy service getter
  let uuidGenerator = Cc["@mozilla.org/uuid-generator;1"]
                        .getService(Ci.nsIUUIDGenerator);
  return uuidGenerator.generateUUID().toString();
}


/**
 * Contacts
 */
function Contacts() {
}
Contacts.prototype = {

  /**
   * nsIDOMGlobalPropertyInitializer implementation
   */
  init: function(aWindow) {
    this.window = aWindow;
    //this.window.addEventListener("unload", this, false);
  },


  /**
   * Helpers
   */

  /**
   * Cache the DB here.
   */
  db: null,

  /**
   * Prepare the database. This may include opening the database and upgrading
   * it to the latest schema version.
   * 
   * @return (via callback) a database ready for use.
   */
  ensureDB: function ensureDB(callback, failureCb) {
    if (this.db) {
      debug("ensureDB: already have a database, returning early.");
      callback(this.db);
      return;
    }

    let self = this;
    function gotDB(db) {
      self.db = db;
      callback(db);
    }

    let indexedDB = this.window.mozIndexedDB;
    let request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function (event) {
      debug("Opened database:", DB_NAME, DB_VERSION);
      gotDB(event.target.result);
    };
    request.onupgradeneeded = function (event) {
      debug("Database needs upgrade:", DB_NAME,
            event.oldVersion, event.newVersion);
      debug("Correct new database version:", event.newVersion == DB_VERSION);

      let db = event.target.result;

      switch (event.oldVersion) {
        case 0:
          debug("New database");
          self.createSchema(db);
          break;

        default:
          debug("No idea what to do with old database version:",
                event.oldVersion);
          event.target.transaction.abort();
          failureCb(new ContactError(IO_ERROR));
          break;
      }
    };
    request.onerror = function (event) {
      debug("Failed to open database:", DB_NAME);
      //TODO look at event.target.Code and change error constant accordingly
      failureCb(new ContactError(IO_ERROR));
    };
    request.onblocked = function (event) {
      debug("Opening database request is blocked.");
      failureCb(new ContactError(IO_ERROR));
    };
  },

  /**
   * Create the initial database schema.
   *
   * The schema of records stored is as follows:
   *
   * {id:            "...",       // UUID
   *  published:     Date(...),   // First published date.
   *  updated:       Date(...),   // Last updated date.
   *  properties:    {...}        // Object holding the ContactProperties
   *  // The following arrays dupe and normalize data from 'properties' so
   *  // that the corresponding fields can be multientry-indexed.
   *  emails:        [],
   *  urls:          [],
   *  phoneNumbers:  [],
   *  ims:           [],
   *  addresses:     [],
   *  organizations: []}
   */
  createSchema: function createSchema(db) {
    let objectStore = db.createObjectStore(STORE_NAME, {keyPath: "id"});

    // Metadata indexes
    objectStore.createIndex("id",        "id", { unique: true });
    objectStore.createIndex("published", "published", { unique: false });
    objectStore.createIndex("updated",   "updated", { unique: false });

    // Indexes for singular properties
    objectStore.createIndex("displayName", "properties.displayName",
                            { unique: false });
    //TODO moar indexes here.

    // Index for the 'name' property
    objectStore.createIndex("familyName", "properties.name.familyName",
                            { unique: false });
    objectStore.createIndex("givenName", "properties.name.givenName",
                            { unique: false });
    //TODO moar indexes here.

    // Indexes for plural properties
    //TODO I want to do this (see bug 692630):
    //objectStore.createIndex("email", "emails", { multientry: true, unique: false });

    //TODO also consider creating indexes for lower case equivalents
    debug("Created object stores and indexes");
  },

  /**
   * Start a new transaction.
   * 
   * @param txn_type
   *        Type of transaction (e.g. IDBTransaction.READ_WRITE)
   * @param callback
   *        Function to call when the transaction is available. It will
   *        be invoked with the transaction and the 'contacts' object store.
   * @param successCb [optional]
   *        Success callback to call on a successful transaction commit.
   * @param failureCb [optional]
   *        Error callback to call when an error is encountered.
   */
  newTxn: function newTxn(txn_type, callback, successCb, failureCb) {
    this.ensureDB(function (db) {
      debug("Starting new transaction", txn_type);
      let txn = db.transaction([STORE_NAME], txn_type);
      debug("Retrieving object store", STORE_NAME);
      let store = txn.objectStore(STORE_NAME);

      txn.oncomplete = function (event) {
        debug("Transaction complete. Returning to callback.");
        successCb(txn.result);
      };
      // The transaction will automatically be aborted.
      txn.onerror = function (event) {
        debug("Caught error on transaction", event.target.errorCode);
        //TODO look at event.target.errorCode and change error constant accordingly
        failureCb(new ContactError(UNKNOWN_ERROR));
      };

      callback(txn, store);
    }, failureCb);
  },

  /**
   * Create a new Contact object.
   * 
   * @param record
   *        A record as stored in IndexedDB
   * @param properties [optional]
   *        Object containing initial field values.
   * 
   * @return a Contact object.
   * 
   * The returned Contact object closes over the IndexedDB record.
   */
  makeContact: function makeContact(record, properties) {
    let contactsService = this;

    let contact = record.properties;
    if (!contact) {
      contact = record.properties = {
        displayName:   null,
        name:          null,
        nickname:      null,
        note:          null,
        birthday:      null,
        emails:        [],
        urls:          [],
        phoneNumbers:  [],
        ims:           [],
        photos:        [],
        addresses:     [],
        organizations: [],
        categories:    []
      };
    }

    for (let field in properties) {
      contact[field] = properties[field];
    }

    /* ContactWriter */

    // Use Object.defineProperty() to ensure these methods aren't
    // writable, configurable, enumerable.
    Object.defineProperty(contact, "save",
                          {value: function save(successCb, errorCb) {
      contactsService.saveContact(record, successCb, errorCb);
    }});

    Object.defineProperty(contact, "remove",
                          {value: function remove(successCb, errorCb) {
      contactsService.removeContact(record, successCb, errorCb);
    }});

    Object.defineProperty(contact, "clone", {value: function clone() {
      return contactsService.cloneContact(record);
    }});

    /* Contact */

    // Use Object.defineProperty() to ensure these methods aren't
    // writable, enumerable.
    Object.defineProperty(contact, "id", {enumerable: true,
                                          get: function () {
      return record.id;
    }});

    Object.defineProperty(contact, "published", {enumerable: true,
                                                 get: function () {
      return record.published;
    }});

    Object.defineProperty(contact, "updated", {enumerable: true,
                                               get: function () {
      return record.updated;
    }});

    Object.seal(contact);
    return contact;
  },

  updateRecordMetadata: function updateRecordMetadata(record) {
    if (!record.id) {
      record.id = generateUUID();
    }
    if (!record.published) {
      record.published = new Date();
    }
    record.updated = new Date();
    //TODO add indexable arrays of plural properties
  },

  saveContact: function saveContact(record, successCb, errorCb) {
    //TODO verify record
    this.newTxn(IDBTransaction.READ_WRITE, function (txn, store) {
      debug("Going to update", record.id);
      this.updateRecordMetadata(record);
      store.put(record);
      txn.result = record.properties;
    }.bind(this), successCb, errorCb);
  },

  removeContact: function removeContact(record, successCb, errorCb) {
    //TODO verify record
    this.newTxn(IDBTransaction.READ_WRITE, function (txn, store) {
      debug("Going to delete", record.id);
      store.delete(record.id);
      txn.result = record.properties;
    }, successCb, errorCb);
  },

  cloneContact: function cloneContact(contact) {
    //TODO should we set 'published'?
    //TODO deep copy arrays and name
    return this.makeContact({properties: contact});
  },


  /**
   * WebContacts API
   */

  /**
   * @param fields
   *        Array naming which fields the caller is interested in.
   * @param successCb
   *        Callback function to invoke with result array.
   * @param failureCb [optional]
   *        Callback function to invoke when there was an error.
   * @param options [optional]
   *        Object specifying search options. Possible attributes:
   *        - filterBy
   *        - filterOp
   *        - filterValue
   *        Possibly supported in the future:
   *        - fields
   *        - sortBy
   *        - sortOrder
   *        - startIndex
   *        - count
   */
  find: function find(successCb, failureCb, options) {
    //TODO PENDING_OPERATION_ERROR -- the transactionality of indexedDB should
    // give us this for free
    //TODO verify fields, options

    let self = this;
    this.newTxn(IDBTransaction.READ_ONLY, function (txn, store) {
      if (options && options.filterOp == "equals") {
        self._findWithIndex(txn, store, options);
      } else if (options && options.filterBy) {
        self._findWithSearch(txn, store, options);
      } else {
        self._findAll(txn, store);
      }
    }, successCb, failureCb);
  },

/* TODO XXX

Ultimately it would be good to go to less blocking approach by processing
only one record at a time as they return from the DB, e.g.:

    request = index.openCursor(IDBKeyRange.only(value));
    request.onSuccess = this._findRequestSuccessHandler.bind(this, txn, filter_keys);

with this method:

  _findRequestSuccessHandler: function (txn, filter_keys, event) {
    if (!txn.result) {
      txn.result = [];
    }
    let record = event.target.result;
    if (!record) {
      // There are no more results in this cursor. Nothing to do.
      return;
    }
    //TODO filter by additional keys
    txn.result.push(this.makeContact(record));
  },
*/

  _findWithIndex: function _findWithIndex(txn, store, options) {
    //TODO verify options.filterBy is an array

    let filter_keys = options.filterBy.slice();
    //TODO check whether filter_keys are valid filters.

    let request;
    // Query records by first filter. Apply any extra filters later.
    let key = filter_keys.shift();
    //TODO check whether filter_key is a valid index;
    debug("Getting index", key);
    let index = store.index(key);
    request = index.getAll(options.filterValue);

    request.onsuccess = function (event) {
      console.log("Request successful. Record count:",
                  event.target.result.length);
      txn.result = event.target.result.map(this.makeContact.bind(this));
      //TODO filter by additional keys
    }.bind(this);
  },

  _findWithSearch: function _findWithSearch(txn, store, options) {
    //TODO verify options.filterBy is an array

    store.getAll().onsuccess = function (event) {
      console.log("Request successful.", event.target.result);
      txn.result = event.target.result.filter(function (record) {
        let properties = record.properties;
        for (let i = 0; i < options.filterBy.length; i++) {
          let field = options.filterBy[i];
          let value;
          switch (field) {
            case "familyName":
            case "givenName":
              value = properties.name[field];
              break;
            case "email":
            case "phoneNumber":
            case "ims":
              // HACK: Join all values together into a string.
              value = [f.value for each (f in properties[field])].join("\n");
            default:
              value = properties[field];
          }
          let match = false;
          switch (options.filterOp) {
            case "icontains":
              match = value.toLowerCase().indexOf(options.filterValue) != -1;
              break;
            //TODO add more stuff here
          }
          if (match) {
            return true;
          }
        }
        return false;
      }).map(this.makeContact.bind(this));
    }.bind(this);
  },

  _findAll: function _findAll(txn, store) {
    store.getAll().onsuccess = function (event) {
      console.log("Request successful. Record count:",
                  event.target.result.length);
      txn.result = event.target.result.map(this.makeContact.bind(this));
    }.bind(this);
  },

  /**
   * Create a new Contact object.
   *
   * @param properties
   *        Initial field values.
   */
  create: function create(properties) {
    // We start with an empty DB record.
    let record = {};
    return this.makeContact(record, properties);
  }

};


/**
 * Fake setup for HTML
 */

let contacts = window.navigator.mozContacts = new Contacts();
contacts.init(window);

function debug() {
  let args = Array.slice(arguments);
  args.unshift("DEBUG");
  console.log.apply(console, args);
}

/**
 * Generate a UUID according to RFC4122 v4 (random UUIDs)
 */
function generateUUID() {
  var chars = '0123456789abcdef';
  var uuid = [];
  var choice;

  uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
  uuid[14] = '4';

  for (var i = 0; i < 36; i++) {
    if (uuid[i]) {
      continue;
    }
    choice = Math.floor(Math.random() * 16);
    // Set bits 6 and 7 of clock_seq_hi to 0 and 1, respectively.
    // (cf. RFC4122 section 4.4)
    uuid[i] = chars[(i == 19) ? (choice & 3) | 8 : choice];
  }

  return uuid.join('');
};
